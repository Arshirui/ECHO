import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/constants/ipcChannels';
import type { AccountLoginStartResult, AccountProvider, AccountStatus } from '../../shared/types/accounts';
import { getAccountService, isAccountProvider, isYouTubeBrowser } from '../accounts/AccountService';
import { startAccountLoginWindow } from '../accounts/AccountLoginWindow';

const requireProvider = (value: unknown): AccountProvider => {
  if (!isAccountProvider(value)) {
    throw new Error('provider must be a supported account provider');
  }

  return value;
};

const requireCookie = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('cookie must be a string');
  }

  return value;
};

export const registerAccountIpc = (): void => {
  ipcMain.handle(IpcChannels.AccountGetStatuses, (): AccountStatus[] => getAccountService().getStatuses());
  ipcMain.handle(IpcChannels.AccountGetStatus, (_event, provider: unknown): AccountStatus =>
    getAccountService().getStatus(requireProvider(provider)),
  );
  ipcMain.handle(IpcChannels.AccountSaveCookie, (_event, provider: unknown, cookie: unknown): AccountStatus =>
    getAccountService().saveCookie(requireProvider(provider), requireCookie(cookie)),
  );
  ipcMain.handle(IpcChannels.AccountStartLogin, (_event, provider: unknown): Promise<AccountLoginStartResult> => {
    const accountProvider = requireProvider(provider);
    return startAccountLoginWindow(accountProvider, getAccountService());
  });
  ipcMain.handle(IpcChannels.AccountClear, (_event, provider: unknown): AccountStatus =>
    getAccountService().clearAccount(requireProvider(provider)),
  );
  ipcMain.handle(IpcChannels.AccountCheck, (_event, provider: unknown): Promise<AccountStatus> =>
    getAccountService().checkAccount(requireProvider(provider)),
  );
  ipcMain.handle(IpcChannels.AccountCheckAll, (): Promise<AccountStatus[]> => getAccountService().checkAllAccounts());
  ipcMain.handle(IpcChannels.AccountSetYouTubeBrowser, (_event, browser: unknown): AccountStatus => {
    if (!isYouTubeBrowser(browser)) {
      throw new Error('browser must be edge, chrome, firefox, or none');
    }

    return getAccountService().setYouTubeBrowser(browser);
  });
};
