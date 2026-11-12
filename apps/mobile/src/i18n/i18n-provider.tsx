import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { AppLanguage } from '@/lib/database.types';
import { readItem, writeItem } from '@/lib/storage';

import { translations, type TranslationKey } from './strings';

const STORAGE_KEY = 'homecare.language';

type I18nContextValue = {
  language: AppLanguage;
  isRTL: boolean;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLanguage(): AppLanguage {
  const saved = readItem(STORAGE_KEY);
  if (saved === 'en' || saved === 'ur') return saved;
  return getLocales()[0]?.languageCode === 'ur' ? 'ur' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);

  const setLanguage = useCallback((next: AppLanguage) => {
    writeItem(STORAGE_KEY, next);
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const table = translations[language];
    return {
      language,
      isRTL: language === 'ur',
      setLanguage,
      t: (key, params) => {
        let text = table[key] ?? translations.en[key] ?? key;
        if (params) {
          for (const [name, val] of Object.entries(params)) {
            text = text.replaceAll(`{${name}}`, String(val));
          }
        }
        return text;
      },
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/**
 * flexDirection for "icon + text" rows: icons sit on the reading-start side
 * (left in English, right in Urdu).
 */
export function useRowDirection(): 'row' | 'row-reverse' {
  return useI18n().isRTL ? 'row-reverse' : 'row';
}
