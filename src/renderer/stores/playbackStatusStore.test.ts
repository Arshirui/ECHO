import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import { hqPlayerConnectDeviceId, type ConnectSessionStatus } from '../../shared/types/connect';
import { beginPlaybackSwitchSnapshot, refreshPlaybackStatus, setPlaybackStatusSnapshot } from './playbackStatusStore';

const audioStatus = (overrides: Partial<AudioStatus> = {}): AudioStatus => ({
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: 'wasapi-shared',
  activeOutputBackendImpl: null,
  outputMode: 'shared',
  useJuceOutputRequested: false,
  useJuceDecodeRequested: false,
  activeDecodeBackendImpl: null,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'nightcore',
  currentFilePath: 'D:\\Music\\song-b.flac',
  currentTrackId: 'track-b',
  durationSeconds: 180,
  positionSeconds: 0,
  channels: 2,
  codec: 'flac',
  bitDepth: 16,
  bitrate: 900000,
  fileSampleRate: 44100,
  decoderOutputSampleRate: 44100,
  requestedOutputSampleRate: 44100,
  actualDeviceSampleRate: 44100,
  sharedDeviceSampleRate: 44100,
  resampling: false,
  bitPerfectCandidate: false,
  sampleRateMismatch: false,
  eqEnabled: false,
  channelBalanceEnabled: false,
  dspActive: false,
  preampDb: 0,
  eqPresetName: 'Flat',
  clippingRisk: false,
  bitPerfectDisabledReason: null,
  warnings: [],
  error: null,
  ...overrides,
});

const hqPlayerStatus = (overrides: Partial<ConnectSessionStatus> = {}): ConnectSessionStatus => ({
  deviceId: hqPlayerConnectDeviceId,
  protocol: 'hqplayer',
  state: 'playing',
  currentTrackId: 'track-hq',
  metadata: {
    title: 'HQ Track',
    artist: 'Artist',
    album: null,
    albumArtist: null,
    durationSeconds: 120,
    coverHttpUrl: '',
  },
  positionSeconds: 0,
  durationSeconds: 120,
  latencyMs: 10,
  error: null,
  updatedAt: '2026-05-25T00:00:00.000Z',
  ...overrides,
});

const ensureTestWindow = (): void => {
  if (typeof window !== 'undefined') {
    return;
  }

  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  });
};

afterEach(() => {
  setPlaybackStatusSnapshot({
    audioStatus: null,
    playbackStatus: null,
    playbackVisualIntent: null,
    error: null,
  });
  vi.useRealTimers();
  if (typeof window !== 'undefined') {
    Reflect.deleteProperty(window, 'echo');
  }
});

describe('playbackStatusStore', () => {
  it('rejects inherited current-track positions that are too far ahead after a track switch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T00:00:00.000Z'));

    beginPlaybackSwitchSnapshot({
      state: 'loading',
      currentTrackId: 'track-b',
      filePath: 'D:\\Music\\song-b.flac',
      positionMs: 0,
      durationMs: 180_000,
    });

    vi.advanceTimersByTime(3000);

    const staleSnapshot = setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ positionSeconds: 60 }),
      error: null,
    });
    expect(staleSnapshot.audioStatus).toBeNull();
    expect(staleSnapshot.playbackStatus?.positionMs).toBe(0);
    expect(staleSnapshot.playbackVisualIntent).not.toBeNull();

    vi.advanceTimersByTime(17_000);

    const lateStaleSnapshot = setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ positionSeconds: 60 }),
      error: null,
    });
    expect(lateStaleSnapshot.audioStatus).toBeNull();
    expect(lateStaleSnapshot.playbackVisualIntent).not.toBeNull();

    const currentSnapshot = setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ positionSeconds: 20 }),
      error: null,
    });
    expect(currentSnapshot.audioStatus?.positionSeconds).toBe(20);
    expect(currentSnapshot.playbackVisualIntent).toBeNull();
  });

  it('accepts a pause position that matches elapsed time during the switch guard', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T00:00:00.000Z'));

    beginPlaybackSwitchSnapshot({
      state: 'loading',
      currentTrackId: 'track-b',
      filePath: 'D:\\Music\\song-b.flac',
      positionMs: 0,
      durationMs: 180_000,
    });

    vi.advanceTimersByTime(5000);

    const snapshot = setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ state: 'paused', positionSeconds: 5 }),
      error: null,
    });
    expect(snapshot.audioStatus?.state).toBe('paused');
    expect(snapshot.audioStatus?.positionSeconds).toBe(5);
  });

  it('accepts a lagging playing position during a streaming track switch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T00:00:00.000Z'));

    beginPlaybackSwitchSnapshot({
      state: 'loading',
      currentTrackId: 'track-b',
      filePath: 'D:\\Music\\song-b.flac',
      positionMs: 0,
      durationMs: 180_000,
    });

    vi.advanceTimersByTime(5000);

    const snapshot = setPlaybackStatusSnapshot({
      audioStatus: audioStatus({ state: 'playing', positionSeconds: 2 }),
      error: null,
    });
    expect(snapshot.audioStatus?.state).toBe('playing');
    expect(snapshot.audioStatus?.positionSeconds).toBe(2);
  });

  it('treats an HQPlayer stopped status at the track tail as ended for auto-advance', async () => {
    ensureTestWindow();
    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'stopped',
          currentTrackId: null,
          positionMs: 0,
          durationMs: 0,
          filePath: null,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus({ state: 'stopped' })),
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue(hqPlayerStatus({
          state: 'stopped',
          positionSeconds: 119,
          durationSeconds: 120,
        })),
      },
    } as unknown as Window['echo'];

    const snapshot = await refreshPlaybackStatus();

    expect(snapshot.playbackStatus).toEqual(expect.objectContaining({
      state: 'ended',
      currentTrackId: 'track-hq',
      positionMs: 119000,
      durationMs: 120000,
    }));
  });

  it('keeps an explicit HQPlayer stop away from the track tail as stopped', async () => {
    ensureTestWindow();
    window.echo = {
      playback: {
        getStatus: vi.fn().mockResolvedValue({
          state: 'stopped',
          currentTrackId: null,
          positionMs: 0,
          durationMs: 0,
          filePath: null,
        }),
      },
      audio: {
        getStatus: vi.fn().mockResolvedValue(audioStatus({ state: 'stopped' })),
      },
      connect: {
        getStatus: vi.fn().mockResolvedValue(hqPlayerStatus({
          state: 'stopped',
          positionSeconds: 0,
          durationSeconds: 120,
        })),
      },
    } as unknown as Window['echo'];

    const snapshot = await refreshPlaybackStatus();

    expect(snapshot.playbackStatus).toEqual(expect.objectContaining({
      state: 'stopped',
      currentTrackId: 'track-hq',
      positionMs: 0,
      durationMs: 120000,
    }));
  });
});
