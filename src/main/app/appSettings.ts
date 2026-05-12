import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../../shared/types/appSettings';

const defaultSettings: AppSettings = {
  hideToTrayOnClose: false,
};

let cachedSettings: AppSettings | null = null;

const getSettingsPath = (): string => join(app.getPath('userData'), 'echo-settings.json');

const normalizeSettings = (value: unknown): AppSettings => {
  if (!value || typeof value !== 'object') {
    return defaultSettings;
  }

  const settings = value as Partial<AppSettings>;

  return {
    hideToTrayOnClose: settings.hideToTrayOnClose === true,
  };
};

export const getAppSettings = (): AppSettings => {
  if (cachedSettings) {
    return cachedSettings;
  }

  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    cachedSettings = defaultSettings;
    return cachedSettings;
  }

  try {
    cachedSettings = normalizeSettings(JSON.parse(readFileSync(settingsPath, 'utf8')));
  } catch {
    cachedSettings = defaultSettings;
  }

  return cachedSettings;
};

export const setAppSettings = (patch: Partial<AppSettings>): AppSettings => {
  const nextSettings = normalizeSettings({ ...getAppSettings(), ...patch });
  const settingsPath = getSettingsPath();

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
  cachedSettings = nextSettings;

  return nextSettings;
};
