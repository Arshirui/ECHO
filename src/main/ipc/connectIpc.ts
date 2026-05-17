import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { ConnectDevice, ConnectReceiverStatus, ConnectSessionStatus } from '../../shared/types/connect';
import { getConnectReceiverService } from '../connect/ConnectReceiverService';
import { getConnectService, normalizeConnectStartRequest } from '../connect/ConnectService';

const sendConnectStatus = (status: ConnectSessionStatus): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.ConnectStatus, status);
    }
  }
};

const sendConnectReceiverStatus = (status: ConnectReceiverStatus): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.ConnectReceiverStatus, status);
    }
  }
};

const normalizeSeconds = (value: unknown): number => {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
};

const normalizeVolume = (value: unknown): number => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 100;
};

export const registerConnectIpc = (): void => {
  const service = getConnectService();
  const receiverService = getConnectReceiverService();
  service.on('status', sendConnectStatus);
  receiverService.on('status', sendConnectReceiverStatus);

  ipcMain.handle(IpcChannels.ConnectListDevices, (): ConnectDevice[] => service.listDevices());
  ipcMain.handle(IpcChannels.ConnectRefresh, (): Promise<ConnectDevice[]> => service.refreshDevices());
  ipcMain.handle(IpcChannels.ConnectGetStatus, (): ConnectSessionStatus => service.getStatus());
  ipcMain.handle(IpcChannels.ConnectConnect, (_event, request: unknown): Promise<ConnectSessionStatus> =>
    service.connect(normalizeConnectStartRequest(request)),
  );
  ipcMain.handle(IpcChannels.ConnectDisconnect, (): Promise<ConnectSessionStatus> => service.disconnect());
  ipcMain.handle(IpcChannels.ConnectPlay, (): Promise<ConnectSessionStatus> => service.play());
  ipcMain.handle(IpcChannels.ConnectPause, (): Promise<ConnectSessionStatus> => service.pause());
  ipcMain.handle(IpcChannels.ConnectStop, (): Promise<ConnectSessionStatus> => service.stop());
  ipcMain.handle(IpcChannels.ConnectSeek, (_event, positionSeconds: unknown): Promise<ConnectSessionStatus> =>
    service.seek(normalizeSeconds(positionSeconds)),
  );
  ipcMain.handle(IpcChannels.ConnectSetVolume, (_event, volumePercent: unknown): Promise<ConnectSessionStatus> =>
    service.setVolume(normalizeVolume(volumePercent)),
  );
  ipcMain.handle(IpcChannels.ConnectReceiverGetStatus, (): ConnectReceiverStatus => receiverService.getStatus());
  ipcMain.handle(IpcChannels.ConnectReceiverSetEnabled, (_event, enabled: unknown): Promise<ConnectReceiverStatus> =>
    receiverService.setEnabled(enabled === true),
  );
  ipcMain.handle(IpcChannels.ConnectReceiverStopPlayback, (): ConnectReceiverStatus => receiverService.stopPlayback());
};
