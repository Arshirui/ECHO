import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import { registerAudioIpc } from './audioIpc';
import { registerLibraryIpc } from './libraryIpc';
import { registerPlaybackIpc } from './playbackIpc';

export const registerIpc = (): void => {
  ipcMain.handle(IpcChannels.AppGetVersion, () => app.getVersion());
  ipcMain.handle(IpcChannels.AppWindowMinimize, (event: IpcMainInvokeEvent): void => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(IpcChannels.AppWindowToggleMaximize, (event: IpcMainInvokeEvent): void => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return;
    }

    if (window.isMaximized()) {
      window.unmaximize();
      return;
    }

    window.maximize();
  });
  ipcMain.handle(IpcChannels.AppWindowClose, (event: IpcMainInvokeEvent): void => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  registerLibraryIpc();
  registerPlaybackIpc();
  registerAudioIpc();
};
