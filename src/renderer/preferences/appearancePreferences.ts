export type AppearancePreferences = {
  mainFontFamily: string;
  chineseFontFamily: string;
  baseFontSize: number;
  lineHeight: number;
};

const storageKey = 'echo-next:appearance-preferences';

export const defaultAppearancePreferences: AppearancePreferences = {
  mainFontFamily: 'Outfit',
  chineseFontFamily: 'Microsoft YaHei',
  baseFontSize: 14,
  lineHeight: 1.35,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeFontName = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.replace(/[\r\n;]/g, '').trim();
  return normalized || fallback;
};

const normalizePreferences = (value: Partial<AppearancePreferences>): AppearancePreferences => ({
  mainFontFamily: normalizeFontName(value.mainFontFamily, defaultAppearancePreferences.mainFontFamily),
  chineseFontFamily: normalizeFontName(value.chineseFontFamily, defaultAppearancePreferences.chineseFontFamily),
  baseFontSize: clamp(Number(value.baseFontSize) || defaultAppearancePreferences.baseFontSize, 12, 18),
  lineHeight: clamp(Number(value.lineHeight) || defaultAppearancePreferences.lineHeight, 1.1, 1.8),
});

const serializeFontList = (value: string): string => {
  const families = value
    .split(',')
    .map((family) => family.trim())
    .filter(Boolean);

  return families.length ? families.map((family) => JSON.stringify(family.replace(/^["']|["']$/g, ''))).join(', ') : JSON.stringify(value);
};

export const readAppearancePreferences = (): AppearancePreferences => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultAppearancePreferences;
    }

    return normalizePreferences(JSON.parse(raw) as Partial<AppearancePreferences>);
  } catch {
    return defaultAppearancePreferences;
  }
};

export const writeAppearancePreferences = (preferences: AppearancePreferences): AppearancePreferences => {
  const normalized = normalizePreferences(preferences);
  window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
};

export const applyAppearancePreferences = (preferences: AppearancePreferences): void => {
  const normalized = normalizePreferences(preferences);
  const root = document.documentElement;
  const fontStack = [
    serializeFontList(normalized.mainFontFamily),
    serializeFontList(normalized.chineseFontFamily),
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    '"PingFang SC"',
    '"Hiragino Sans"',
    '"Yu Gothic"',
    'sans-serif',
  ].join(', ');

  root.style.setProperty('--echo-font-family', fontStack);
  root.style.setProperty('--echo-base-font-size', `${normalized.baseFontSize}px`);
  root.style.setProperty('--echo-ui-line-height', normalized.lineHeight.toFixed(2));
};

export const updateAppearancePreferences = (preferences: AppearancePreferences): AppearancePreferences => {
  const normalized = writeAppearancePreferences(preferences);
  applyAppearancePreferences(normalized);
  return normalized;
};
