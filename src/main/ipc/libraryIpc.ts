import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { LibrarySummary } from '../../shared/types/library';

export const registerLibraryIpc = (): void => {
  ipcMain.handle(IpcChannels.LibraryGetSummary, (): LibrarySummary => ({
    songCount: 0,
    albumCount: 0,
    artistCount: 0,
  }));
};
