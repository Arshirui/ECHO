import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { isLocale, localeOptions, translations } from './locales';
import type { Locale, TranslationKey } from './locales';

const storageKey = 'echo-next.locale';
const fallbackLocale: Locale = 'zh-CN';

type TranslateOptions = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  localeOptions: typeof localeOptions;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, options?: TranslateOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const readInitialLocale = (): Locale => {
  if (typeof window === 'undefined') {
    return fallbackLocale;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (isLocale(stored)) {
    return stored;
  }

  const browserLocale = window.navigator.language;

  if (browserLocale.startsWith('zh-TW') || browserLocale.startsWith('zh-HK') || browserLocale.startsWith('zh-MO')) {
    return 'zh-TW';
  }

  if (browserLocale.startsWith('ja')) {
    return 'ja-JP';
  }

  if (browserLocale.startsWith('en')) {
    return 'en-US';
  }

  return fallbackLocale;
};

const interpolate = (text: string, options?: TranslateOptions): string => {
  if (!options) {
    return text;
  }

  return Object.entries(options).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    text,
  );
};

export const I18nProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(storageKey, locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale): void => {
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey, options?: TranslateOptions): string => {
      const text = translations[locale][key] ?? translations[fallbackLocale][key] ?? key;
      return interpolate(text, options);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localeOptions,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }

  return context;
};

