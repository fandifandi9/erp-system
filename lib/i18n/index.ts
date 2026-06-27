import { enMessages } from "./messages/en";
import { idMessages } from "./messages/id";
import type { Locale, MessageTree, MessageValue } from "./types";
import { DEFAULT_LOCALE } from "./types";

const catalogs: Record<Locale, MessageTree> = {
  id: idMessages,
  en: enMessages,
};

function getNested(tree: MessageTree, path: string): MessageValue | undefined {
  const parts = path.split(".");
  let cur: MessageValue | undefined = tree;
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as MessageTree)[p];
  }
  return cur;
}

export function createTranslator(locale: Locale) {
  const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  return function t(path: string, vars?: Record<string, string | number | undefined>): string {
    const val = getNested(catalog, path);
    if (typeof val !== "string") return path;
    if (!vars) return val;
    return val.replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = vars[key];
      return v === undefined || v === null ? "" : String(v);
    });
  };
}

export function formatActivityEventLabel(
  locale: Locale,
  eventCode: string,
  payload?: Record<string, unknown>,
  entityLabel?: string,
): string {
  const t = createTranslator(locale);
  const template = t(`activity.events.${eventCode}`);
  if (template === `activity.events.${eventCode}`) {
    return entityLabel || eventCode;
  }
  const vars: Record<string, string> = { entity_label: entityLabel ?? "" };
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (typeof v === "string" || typeof v === "number") vars[k] = String(v);
  }
  if (!vars.order_no && entityLabel) vars.order_no = entityLabel;
  if (!vars.invoice_no && payload?.invoice_no) vars.invoice_no = String(payload.invoice_no);
  if (!vars.po_no && payload?.po_no) vars.po_no = String(payload.po_no);
  if (!vars.ref && payload?.ref) vars.ref = String(payload.ref);
  if (!vars.name && payload?.name) vars.name = String(payload.name);
  return t(`activity.events.${eventCode}`, vars);
}

export { catalogs, DEFAULT_LOCALE };
export type { Locale };
