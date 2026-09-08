import type { Locale } from "./types";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./types";

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const v = localStorage.getItem(LOCALE_STORAGE_KEY);
  return v === "en" ? "en" : DEFAULT_LOCALE;
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
