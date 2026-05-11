import { app, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { registerAudioIpc } from './audioIpc';
import { registerLibraryIpc } from './libraryIpc';
import { registerPlaybackIpc } from './playbackIpc';

export const registerIpc = (): void => {
  ipcMain.handle(IpcChannels.AppGetVersion, () => app.getVersion());

  registerLibraryIpc();
  registerPlaybackIpc();
  registerAudioIpc();
};
