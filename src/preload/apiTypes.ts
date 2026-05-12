import type { AudioDeviceInfo, AudioOutputSettings, AudioStatus } from '../shared/types/audio';
import type { AppSettings } from '../shared/types/appSettings';
import type { EqPreset, EqSavePresetRequest, EqSetBandFrequencyRequest, EqSetBandGainRequest, EqState } from '../shared/types/eq';
import type {
  LibraryAlbum,
  LibraryDiagnostics,
  LibraryTrackTagUpdateRequest,
  LibraryFolder,
  LibraryPage,
  LibraryPageQuery,
  LibraryScanStatus,
  LibrarySummary,
  LibraryTrack,
} from '../shared/types/library';
import type { PlaybackStartRequest, PlaybackStatus } from '../shared/types/playback';

export type EchoApi = {
  app: {
    getVersion: () => Promise<string>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    getSettings: () => Promise<AppSettings>;
    setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  library: {
    chooseFolder: () => Promise<string | null>;
    addFolder: (path: string) => Promise<LibraryFolder>;
    getFolders: () => Promise<LibraryFolder[]>;
    removeFolder: (folderId: string) => Promise<void>;
    scanFolder: (folderId: string) => Promise<LibraryScanStatus>;
    getScanStatus: (jobId: string) => Promise<LibraryScanStatus>;
    cancelScan: (jobId: string) => Promise<LibraryScanStatus>;
    getTracks: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryTrack>>;
    getAlbums: (query?: LibraryPageQuery) => Promise<LibraryPage<LibraryAlbum>>;
    getAlbumTracks: (
      albumId: string,
      query?: Pick<LibraryPageQuery, 'page' | 'pageSize'>,
    ) => Promise<LibraryPage<LibraryTrack>>;
    getSummary: () => Promise<LibrarySummary>;
    getDiagnostics: () => Promise<LibraryDiagnostics>;
    updateTrackTags: (request: LibraryTrackTagUpdateRequest) => Promise<LibraryTrack>;
    openTrackInFolder: (trackId: string) => Promise<void>;
    openTrackWithSystem: (trackId: string) => Promise<void>;
    copyTrackPath: (trackId: string) => Promise<void>;
    copyTrackNameArtist: (trackId: string) => Promise<void>;
    copyTrackCover: (trackId: string) => Promise<boolean>;
    saveTrackCover: (trackId: string) => Promise<string | null>;
    deleteTrackFile: (trackId: string) => Promise<void>;
  };
  playback: {
    getStatus: () => Promise<PlaybackStatus>;
    playLocalFile: (request: PlaybackStartRequest) => Promise<PlaybackStatus>;
    play: () => Promise<PlaybackStatus>;
    pause: () => Promise<PlaybackStatus>;
    stop: () => Promise<PlaybackStatus>;
    seek: (positionSeconds: number) => Promise<PlaybackStatus>;
    openLocalAudioFile: () => Promise<string | null>;
  };
  audio: {
    getStatus: () => Promise<AudioStatus>;
    listDevices: () => Promise<AudioDeviceInfo[]>;
    setOutput: (settings: AudioOutputSettings) => Promise<AudioStatus>;
  };
  eq: {
    getState: () => Promise<EqState>;
    setEnabled: (enabled: boolean) => Promise<EqState>;
    setBandGain: (request: EqSetBandGainRequest) => Promise<EqState>;
    setBandFrequency: (request: EqSetBandFrequencyRequest) => Promise<EqState>;
    setPreamp: (preampDb: number) => Promise<EqState>;
    setPreset: (presetId: string) => Promise<EqState>;
    reset: () => Promise<EqState>;
    listPresets: () => Promise<EqPreset[]>;
    savePreset: (request: EqSavePresetRequest) => Promise<EqPreset>;
    deletePreset: (presetId: string) => Promise<EqPreset[]>;
  };
};

declare global {
  interface Window {
    echo: EchoApi;
  }
}
