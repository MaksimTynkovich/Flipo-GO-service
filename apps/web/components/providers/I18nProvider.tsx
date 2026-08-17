"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  getRuntimeLocale,
  setRuntimeLocale,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "@/lib/i18n";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function writeStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore quota / private mode
  }
}

export function I18nProvider({
  children,
  lockedLocale,
}: {
  children: ReactNode;
  /** Force a locale without writing localStorage (admin panel). */
  lockedLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(lockedLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    if (lockedLocale) {
      setLocaleState(lockedLocale);
      setRuntimeLocale(lockedLocale);
      return;
    }
    const stored = readStoredLocale();
    setLocaleState(stored);
    setRuntimeLocale(stored);
    document.documentElement.lang = stored;
  }, [lockedLocale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (lockedLocale) return;
      const normalized = normalizeLocale(next);
      setLocaleState(normalized);
      setRuntimeLocale(normalized);
      writeStoredLocale(normalized);
      document.documentElement.lang = normalized;
    },
    [lockedLocale],
  );

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return (key: MessageKey, params?: TranslateParams) =>
      translate(getRuntimeLocale(), key, params);
  }
  return ctx.t;
}
