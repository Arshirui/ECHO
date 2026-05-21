import { Socket } from 'node:net';
import type {
  HqPlayerConnectionTestResult,
  HqPlayerEndpoint,
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerPlaybackHandoffReason,
  HqPlayerPlaybackHandoffRequest,
  HqPlayerPlaybackHandoffSource,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../../shared/types/hqplayer';
import type { RemoteStreamUrlResult } from '../../../shared/types/remoteSources';
import type { StreamingPlaybackRequest, StreamingPlaybackSource } from '../../../shared/types/streaming';
import { defaultHqPlayerSettings, getAppSettings, normalizeHqPlayerSettings, setAppSettings } from '../../app/appSettings';
import { getRemoteSourceService } from '../../library/remote/RemoteSourceService';
import { getStreamingService } from '../../streaming/StreamingService';
import { createHqPlayerPlaybackControlPlan } from './HqPlayerControlAdapter';
import { getHqPlayerMediaServer, type HqPlayerMediaServerBridge, type HqPlayerMediaServerInput } from './HqPlayerMediaServer';

type TcpProbeRequest = {
  host: string;
  port: number;
  timeoutMs: number;
};

type TcpProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
};

export type HqPlayerTcpProbe = (request: TcpProbeRequest) => Promise<TcpProbeResult>;

export type HqPlayerSettingsStore = {
  read: () => HqPlayerSettings;
  write: (settings: HqPlayerSettings) => HqPlayerSettings;
};

export type HqPlayerMediaResolver = {
  createRemoteStreamUrl: (input: {
    trackId?: string;
    sourceId?: string;
    remotePath?: string;
    stableKey?: string;
  }) => Promise<RemoteStreamUrlResult>;
  resolveStreamingPlayback: (request: StreamingPlaybackRequest, options?: { forceRefresh?: boolean }) => Promise<StreamingPlaybackSource>;
};

const hqPlayerConnectionTimeoutMs = 1500;

const defaultMediaResolver: HqPlayerMediaResolver = {
  createRemoteStreamUrl: (input) => getRemoteSourceService().createStreamUrl(input),
  resolveStreamingPlayback: (request, options) => {
    if (options?.forceRefresh) {
      getStreamingService().invalidatePlayback(request);
    }
    return getStreamingService().resolvePlayback(request);
  },
};

const toEndpoint = (settings: HqPlayerSettings): HqPlayerEndpoint => ({
  connectionMode: settings.connectionMode,
  host: settings.host,
  port: settings.port,
});

const createStatus = (
  settings: HqPlayerSettings,
  overrides: Partial<Pick<HqPlayerStatus, 'state' | 'lastCheckedAt' | 'lastError'>> = {},
): HqPlayerStatus => ({
  enabled: settings.enabled,
  state: settings.enabled ? (settings.port ? 'unavailable' : 'not-configured') : 'disabled',
  endpoint: toEndpoint(settings),
  mediaServerEnabled: settings.mediaServerEnabled,
  defaultPlaybackBackend: settings.defaultPlaybackBackend,
  profileName: settings.profileName,
  lastCheckedAt: null,
  lastError: null,
  ...overrides,
});

const safeProbeError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 240);
  }

  return String(error || 'hqplayer_connection_failed').slice(0, 240);
};

const probeTcpEndpoint: HqPlayerTcpProbe = ({ host, port, timeoutMs }) =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = new Socket();
    let settled = false;

    const finish = (ok: boolean, error: string | null = null): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({
        ok,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        error,
      });
    };

    socket.setTimeout(timeoutMs, () => finish(false, 'hqplayer_connection_timeout'));
    socket.once('connect', () => finish(true));
    socket.once('error', (error) => finish(false, safeProbeError(error)));
    socket.connect({ host, port });
  });

const defaultSettingsStore: HqPlayerSettingsStore = {
  read: () => normalizeHqPlayerSettings(getAppSettings().hqPlayer),
  write: (settings) => setAppSettings({ hqPlayer: settings }).hqPlayer ?? settings,
};

const hasHeaders = (headers: Record<string, string> | undefined): boolean => Object.keys(headers ?? {}).length > 0;

const isHttpUrl = (value: string): boolean => /^https?:\/\//iu.test(value.trim());

const isLoopbackHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
};

export class HqPlayerService {
  private status: HqPlayerStatus;
  private lastPlaybackHandoffPlan: HqPlayerPlaybackHandoffPlan | null = null;
  private lastPlaybackControlPlan: HqPlayerPlaybackControlPlan | null = null;

  constructor(
    private readonly store: HqPlayerSettingsStore = defaultSettingsStore,
    private readonly tcpProbe: HqPlayerTcpProbe = probeTcpEndpoint,
    private readonly mediaResolver: HqPlayerMediaResolver = defaultMediaResolver,
    private readonly mediaServer: HqPlayerMediaServerBridge = getHqPlayerMediaServer(),
  ) {
    this.status = createStatus(this.store.read());
  }

  getSettings(): HqPlayerSettings {
    return this.store.read();
  }

  setSettings(patch: Partial<HqPlayerSettings>): HqPlayerSettings {
    const settings = normalizeHqPlayerSettings({ ...this.store.read(), ...patch });
    const saved = this.store.write(settings);
    this.status = createStatus(saved);
    return saved;
  }

  getStatus(): HqPlayerStatus {
    const settings = this.store.read();
    if (this.status.endpoint.host !== settings.host || this.status.endpoint.port !== settings.port || this.status.enabled !== settings.enabled) {
      this.status = createStatus(settings, {
        lastCheckedAt: this.status.lastCheckedAt,
        lastError: this.status.lastError,
      });
    }

    return { ...this.status, endpoint: { ...this.status.endpoint } };
  }

  getLastPlaybackHandoffPlan(): HqPlayerPlaybackHandoffPlan | null {
    return this.lastPlaybackHandoffPlan;
  }

  getLastPlaybackControlPlan(): HqPlayerPlaybackControlPlan | null {
    return this.lastPlaybackControlPlan;
  }

  async testConnection(patch?: Partial<HqPlayerSettings>): Promise<HqPlayerConnectionTestResult> {
    const settings = patch ? normalizeHqPlayerSettings({ ...this.store.read(), ...patch }) : this.store.read();
    const endpoint = toEndpoint(settings);
    const checkedAt = new Date().toISOString();

    if (!settings.enabled) {
      const result = {
        ok: false,
        state: 'disabled' as const,
        endpoint,
        elapsedMs: 0,
        checkedAt,
        error: 'hqplayer_disabled',
      };
      this.status = createStatus(settings, {
        state: result.state,
        lastCheckedAt: checkedAt,
        lastError: result.error,
      });
      return result;
    }

    if (!settings.port) {
      const result = {
        ok: false,
        state: 'not-configured' as const,
        endpoint,
        elapsedMs: 0,
        checkedAt,
        error: 'hqplayer_control_port_not_configured',
      };
      this.status = createStatus(settings, {
        state: result.state,
        lastCheckedAt: checkedAt,
        lastError: result.error,
      });
      return result;
    }

    this.status = createStatus(settings, {
      state: 'checking',
      lastCheckedAt: checkedAt,
      lastError: null,
    });

    const probe = await this.tcpProbe({
      host: settings.host,
      port: settings.port,
      timeoutMs: hqPlayerConnectionTimeoutMs,
    });
    const result = {
      ok: probe.ok,
      state: probe.ok ? 'available' as const : 'unavailable' as const,
      endpoint,
      elapsedMs: probe.elapsedMs,
      checkedAt,
      error: probe.error,
    };

    this.status = createStatus(settings, {
      state: result.state,
      lastCheckedAt: checkedAt,
      lastError: result.error,
    });

    return result;
  }

  async createPlaybackHandoff(request: HqPlayerPlaybackHandoffRequest): Promise<HqPlayerPlaybackHandoffPlan> {
    const settings = this.store.read();
    const createdAt = new Date().toISOString();
    const remember = (plan: Omit<HqPlayerPlaybackHandoffPlan, 'control'>): HqPlayerPlaybackHandoffPlan => {
      const control = createHqPlayerPlaybackControlPlan(plan);
      const nextPlan = {
        ...plan,
        control,
      };
      this.lastPlaybackHandoffPlan = nextPlan;
      this.lastPlaybackControlPlan = control;
      return nextPlan;
    };
    const fallback = (reason: HqPlayerPlaybackHandoffReason): HqPlayerPlaybackHandoffPlan => remember({
      state: reason === 'hqplayer_confirmation_required' ? 'needs-confirmation' : 'fallback',
      reason,
      endpoint: toEndpoint(settings),
      defaultPlaybackBackend: settings.defaultPlaybackBackend,
      profileName: settings.profileName,
      source: null,
      fallback: reason === 'hqplayer_confirmation_required' ? null : { backend: 'echoNative', reason },
      createdAt,
    });

    if (!settings.enabled) {
      return fallback('hqplayer_disabled');
    }

    if (!settings.port) {
      return fallback('hqplayer_control_port_not_configured');
    }

    if (settings.defaultPlaybackBackend === 'echoNative') {
      return fallback('echo_native_selected');
    }

    if (settings.defaultPlaybackBackend === 'ask' && request.confirmed !== true) {
      return fallback('hqplayer_confirmation_required');
    }

    try {
      const source = await this.resolveHandoffSource(request, settings);
      if (typeof source === 'string') {
        return fallback(source);
      }

      return remember({
        state: 'ready',
        reason: null,
        endpoint: toEndpoint(settings),
        defaultPlaybackBackend: settings.defaultPlaybackBackend,
        profileName: settings.profileName,
        source,
        fallback: null,
        createdAt,
      });
    } catch {
      return fallback('source_resolution_failed');
    }
  }

  private async resolveHandoffSource(
    request: HqPlayerPlaybackHandoffRequest,
    settings: HqPlayerSettings,
  ): Promise<HqPlayerPlaybackHandoffSource | HqPlayerPlaybackHandoffReason> {
    const { item } = request;
    const resolvedSource = request.resolvedSource ?? null;
    const startSeconds = Math.max(0, Number.isFinite(request.startSeconds) ? request.startSeconds ?? 0 : 0);
    const base = {
      trackId: item.trackId,
      mediaType: item.mediaType,
      title: item.title,
      artist: item.artist,
      album: item.album,
      durationSeconds: item.duration ?? resolvedSource?.durationSeconds ?? resolvedSource?.probe?.durationSeconds ?? null,
      startSeconds,
    };

    if (item.mediaType === 'local') {
      const sourceUrl = resolvedSource?.filePath ?? item.path;
      if (settings.connectionMode === 'remote') {
        return this.createMediaServerSource(
          {
            ...base,
            url: sourceUrl,
            exposure: 'local-file',
            headers: {},
            mimeType: resolvedSource?.mimeType ?? null,
            expiresAt: null,
            streaming: null,
          },
          { url: sourceUrl, mimeType: resolvedSource?.mimeType ?? null },
          settings,
        );
      }

      return {
        ...base,
        url: sourceUrl,
        exposure: 'local-file',
        headers: {},
        mimeType: resolvedSource?.mimeType ?? null,
        expiresAt: null,
        streaming: null,
      };
    }

    if (item.mediaType === 'remote') {
      if (settings.connectionMode === 'remote' && !settings.mediaServerEnabled) {
        return 'remote_hqplayer_requires_media_server';
      }

      const stream = resolvedSource
        ? {
            url: resolvedSource.filePath,
            expiresAt: null,
          }
        : await this.mediaResolver.createRemoteStreamUrl({
            trackId: item.trackId,
            sourceId: item.sourceId ?? undefined,
            remotePath: item.remotePath ?? undefined,
            stableKey: item.stableKey ?? undefined,
          });
      if (settings.connectionMode === 'remote') {
        return this.createMediaServerSource(
          {
            ...base,
            url: stream.url,
            exposure: 'loopback-http',
            headers: {},
            mimeType: resolvedSource?.mimeType ?? null,
            expiresAt: stream.expiresAt,
            streaming: null,
          },
          { url: stream.url, mimeType: resolvedSource?.mimeType ?? null },
          settings,
        );
      }

      return {
        ...base,
        url: stream.url,
        exposure: isLoopbackHttpUrl(stream.url) ? 'loopback-http' : 'direct-http',
        headers: {},
        mimeType: resolvedSource?.mimeType ?? null,
        expiresAt: stream.expiresAt,
        streaming: null,
      };
    }

    if (item.mediaType === 'streaming') {
      if (item.provider === 'spotify') {
        return 'spotify_sdk_required';
      }

      if (item.playable === false) {
        return 'streaming_item_unplayable';
      }

      const playbackRequest = {
        provider: item.provider,
        providerTrackId: item.providerTrackId,
        quality: item.quality,
      };
      const source = resolvedSource
        ? {
            provider: item.provider,
            providerTrackId: item.providerTrackId,
            url: resolvedSource.filePath,
            expiresAt: null,
            mimeType: resolvedSource.mimeType ?? null,
            bitrate: resolvedSource.probe?.bitrate ?? null,
            sampleRate: resolvedSource.probe?.fileSampleRate ?? null,
            bitDepth: resolvedSource.probe?.bitDepth ?? null,
            codec: resolvedSource.probe?.codec ?? null,
            headers: resolvedSource.inputHeaders ?? {},
            requiresProxy: false,
            supportsRange: isHttpUrl(resolvedSource.filePath),
          }
        : await this.mediaResolver.resolveStreamingPlayback(playbackRequest, { forceRefresh: request.forceRefresh === true });

      if (source.requiresProxy) {
        return 'streaming_proxy_required';
      }

      if (hasHeaders(source.headers)) {
        if (!settings.mediaServerEnabled) {
          return 'source_requires_headers';
        }

        return this.createMediaServerSource(
          {
            ...base,
            url: source.url,
            exposure: isHttpUrl(source.url) ? 'direct-http' : 'local-file',
            headers: source.headers,
            mimeType: source.mimeType ?? null,
            expiresAt: source.expiresAt,
            streaming: {
              provider: source.provider,
              providerTrackId: source.providerTrackId,
              bitrate: source.bitrate,
              sampleRate: source.sampleRate,
              bitDepth: source.bitDepth,
              codec: source.codec,
              supportsRange: source.supportsRange,
            },
          },
          { url: source.url, headers: source.headers, mimeType: source.mimeType },
          settings,
        );
      }

      if (!isHttpUrl(source.url) && settings.connectionMode === 'remote') {
        return this.createMediaServerSource(
          {
            ...base,
            url: source.url,
            exposure: 'local-file',
            headers: {},
            mimeType: source.mimeType ?? null,
            expiresAt: source.expiresAt,
            streaming: {
              provider: source.provider,
              providerTrackId: source.providerTrackId,
              bitrate: source.bitrate,
              sampleRate: source.sampleRate,
              bitDepth: source.bitDepth,
              codec: source.codec,
              supportsRange: source.supportsRange,
            },
          },
          { url: source.url, mimeType: source.mimeType },
          settings,
        );
      }

      return {
        ...base,
        url: source.url,
        exposure: isHttpUrl(source.url) ? 'direct-http' : 'local-file',
        headers: source.headers,
        mimeType: source.mimeType ?? null,
        expiresAt: source.expiresAt,
        streaming: {
          provider: source.provider,
          providerTrackId: source.providerTrackId,
          bitrate: source.bitrate,
          sampleRate: source.sampleRate,
          bitDepth: source.bitDepth,
          codec: source.codec,
          supportsRange: source.supportsRange,
        },
      };
    }

    return 'unsupported_media_type';
  }

  private async createMediaServerSource(
    source: HqPlayerPlaybackHandoffSource,
    input: HqPlayerMediaServerInput,
    settings: HqPlayerSettings,
  ): Promise<HqPlayerPlaybackHandoffSource | HqPlayerPlaybackHandoffReason> {
    if (!settings.mediaServerEnabled) {
      return 'remote_hqplayer_requires_media_server';
    }

    try {
      const served = await this.mediaServer.createUrl(input, {
        port: settings.mediaServerPort,
        remoteAccess: settings.connectionMode === 'remote',
      });
      return {
        ...source,
        url: served.url,
        exposure: 'media-server',
        headers: {},
        expiresAt: served.expiresAt,
      };
    } catch {
      return 'media_server_not_ready';
    }
  }
}

let hqPlayerService: HqPlayerService | null = null;

export const getHqPlayerService = (): HqPlayerService => {
  hqPlayerService ??= new HqPlayerService();
  return hqPlayerService;
};

export const createDefaultHqPlayerSettings = (): HqPlayerSettings => ({ ...defaultHqPlayerSettings });
