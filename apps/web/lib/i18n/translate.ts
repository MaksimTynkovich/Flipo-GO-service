import { en, type MessageKey } from "./en";
import { ru } from "./ru";
import { DEFAULT_LOCALE, type Locale } from "./locale";

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  ru,
};

export type TranslateParams = Record<string, string | number>;

export type TFunction = (key: MessageKey, params?: TranslateParams) => string;

export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  let text = dict[key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function pluralIndex(count: number, locale: Locale): "one" | "few" | "many" {
  const n = Math.abs(Math.trunc(count));
  if (locale === "en") {
    return n === 1 ? "one" : "many";
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "few";
  return "many";
}
