type EchoPluginPermission =
  | 'playback:read'
  | 'playback:control'
  | 'library:read'
  | 'library:write'
  | 'settings:read'
  | 'settings:write'
  | 'network'
  | 'fs:plugin';

type EchoPluginEventName = 'playback:status' | 'library:changed';

type EchoPlaybackStatus = {
  host?: string;
  state: string;
  currentTrackId: string | null;
  currentFilePath?: string | null;
  durationSeconds?: number;
  positionSeconds?: number;
  volume?: number;
};

type EchoPluginTrackField =
  | 'id'
  | 'mediaType'
  | 'path'
  | 'sourceId'
  | 'provider'
  | 'remotePath'
  | 'stableKey'
  | 'title'
  | 'artist'
  | 'album'
  | 'albumArtist'
  | 'trackNo'
  | 'discNo'
  | 'year'
  | 'genre'
  | 'duration'
  | 'codec'
  | 'sampleRate'
  | 'bitDepth'
  | 'bitrate'
  | 'bpm'
  | 'coverId'
  | 'coverThumb'
  | 'metadataStatus'
  | 'embeddedMetadataStatus'
  | 'embeddedCoverStatus'
  | 'networkMetadataStatus'
  | 'fieldSources'
  | 'unavailable';

type EchoPluginTrack = Partial<Record<EchoPluginTrackField, unknown>> & {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverThumb?: string | null;
  unavailable?: boolean;
};

type EchoPluginTrackQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'default' | 'titleAsc' | 'titleDesc' | 'artist' | 'album' | 'recent' | 'durationAsc' | 'durationDesc' | 'qualityAsc' | 'qualityDesc' | 'frequent';
  sourceProvider?: 'local' | 'netease' | 'qqmusic' | 'spotify' | 'remote';
  fields?: EchoPluginTrackField[];
};

type EchoPluginPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

type EchoPluginCommandOptions = {
  title?: string;
  description?: string;
};

type EchoPluginApi = {
  events: {
    on(eventName: 'playback:status', handler: (status: EchoPlaybackStatus) => void | Promise<void>): () => void;
    on(eventName: 'library:changed', handler: (payload: unknown) => void | Promise<void>): () => void;
    on(eventName: EchoPluginEventName, handler: (payload: unknown) => void | Promise<void>): () => void;
  };
  commands: {
    register(commandId: string, handler: (...args: unknown[]) => unknown): void;
    register(commandId: string, options: EchoPluginCommandOptions, handler: (...args: unknown[]) => unknown): void;
  };
  playback: {
    getStatus(): Promise<EchoPlaybackStatus>;
    play(): Promise<unknown>;
    pause(): Promise<unknown>;
    stop(): Promise<unknown>;
    seek(positionSeconds: number): Promise<unknown>;
  };
  library: {
    getSummary(): Promise<Record<string, unknown>>;
    getTracks(query?: EchoPluginTrackQuery): Promise<EchoPluginPage<EchoPluginTrack>>;
  };
  settings: {
    get(): Promise<Record<string, unknown>>;
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
  ui: {
    notify(message: string): Promise<void>;
  };
};

type EchoPluginPanelAction = 'plugin:getSummary' | 'plugin:getLogs' | 'plugin:runCommand';

type EchoPluginPanelRequest = {
  channel: 'echo:plugin-panel';
  version: 1;
  type: 'request';
  requestId: string;
  pluginId: string;
  action: EchoPluginPanelAction;
  payload?: unknown;
};

type EchoPluginPanelResponse =
  | {
      channel: 'echo:plugin-panel';
      version: 1;
      type: 'response';
      requestId: string;
      pluginId: string;
      ok: true;
      result: unknown;
    }
  | {
      channel: 'echo:plugin-panel';
      version: 1;
      type: 'response';
      requestId: string;
      pluginId: string;
      ok: false;
      error: string;
    };

declare const echo: EchoPluginApi;
