import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { PlaybackStatus } from '../../shared/types/playback';

export const registerPlaybackIpc = (): void => {
  ipcMain.handle(IpcChannels.PlaybackGetStatus, (): PlaybackStatus => ({
    state: 'idle',
    currentTrackId: null,
    positionMs: 0,
  }));
};
