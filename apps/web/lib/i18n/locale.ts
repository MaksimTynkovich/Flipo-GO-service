export const LOCALES = ["en", "ru"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "flipo_locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ru";
}

export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const raw = value.trim().toLowerCase();
  if (raw === "ru" || raw.startsWith("ru-")) return "ru";
  return DEFAULT_LOCALE;
}

export function localeDateTag(locale: Locale): string {
  return locale === "ru" ? "ru-RU" : "en-US";
}
