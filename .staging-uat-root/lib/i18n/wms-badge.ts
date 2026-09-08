import type { Locale } from "./types";
import { createTranslator } from "./index";

export type WmsBadgeMeta = { badgeId: string; cls: string; label: string };

export function translateWmsBadge(locale: Locale, meta: WmsBadgeMeta): string {
  if (meta.badgeId === "none") return meta.label;
  const t = createTranslator(locale);
  const key = `wms.badge.${meta.badgeId}`;
  const translated = t(key);
  return translated === key ? meta.label : translated;
}
