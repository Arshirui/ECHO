import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AudioStatus } from '../../shared/types/audio';

export const registerAudioIpc = (): void => {
  ipcMain.handle(IpcChannels.AudioGetStatus, (): AudioStatus => ({
    host: 'not-initialized',
    outputDeviceId: null,
  }));
};
