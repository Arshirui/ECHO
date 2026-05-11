import type { AudioStatus } from '../shared/types/audio';
import type { LibrarySummary } from '../shared/types/library';
import type { PlaybackStatus } from '../shared/types/playback';

export type EchoApi = {
  app: {
    getVersion: () => Promise<string>;
  };
  library: {
    getSummary: () => Promise<LibrarySummary>;
  };
  playback: {
    getStatus: () => Promise<PlaybackStatus>;
  };
  audio: {
    getStatus: () => Promise<AudioStatus>;
  };
};

declare global {
  interface Window {
    echo: EchoApi;
  }
}
