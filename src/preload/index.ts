import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels } from '../shared/constants/ipcChannels';
import type { EchoApi } from './apiTypes';

const echoApi: EchoApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(IpcChannels.AppGetVersion),
  },
  library: {
    getSummary: () => ipcRenderer.invoke(IpcChannels.LibraryGetSummary),
  },
  playback: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.PlaybackGetStatus),
  },
  audio: {
    getStatus: () => ipcRenderer.invoke(IpcChannels.AudioGetStatus),
  },
};

contextBridge.exposeInMainWorld('echo', echoApi);
