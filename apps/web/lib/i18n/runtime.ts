import { DEFAULT_LOCALE, type Locale, normalizeLocale } from "./locale";

let current: Locale = DEFAULT_LOCALE;

export function getRuntimeLocale(): Locale {
  return current;
}

export function setRuntimeLocale(locale: Locale) {
  current = normalizeLocale(locale);
}
