export type Locale = "id" | "en";

export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_STORAGE_KEY = "serba_locale";

export type MessageValue = string | MessageTree;
export type MessageTree = { [key: string]: MessageValue };
