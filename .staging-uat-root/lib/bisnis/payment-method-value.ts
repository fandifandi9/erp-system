import type { PaymentMethodSetting } from "./types";

export function normalizePaymentMethodCode(raw?: string) {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function findPaymentMethod(
  methods: PaymentMethodSetting[],
  selected: string,
): PaymentMethodSetting | undefined {
  const norm = normalizePaymentMethodCode(selected);
  return methods.find((m) => {
    if (m.id === selected) return true;
    if (m.code === selected || m.name === selected) return true;
    return (
      normalizePaymentMethodCode(m.code) === norm ||
      normalizePaymentMethodCode(m.name) === norm
    );
  });
}

/** Nilai untuk field Relation `biz_payments.payment_method` → id record master. */
export function paymentMethodRelationId(m: PaymentMethodSetting): string {
  return m.id;
}

/** Opsi Select `biz_sales_orders.payment_method` di PocketBase. */
export const SO_PAYMENT_METHOD_SELECT = [
  "cash",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "e_wallet",
  "cod",
  "other",
] as const;

export type SoPaymentMethodSelect = (typeof SO_PAYMENT_METHOD_SELECT)[number];

/** Map master `biz_payment_methods` → opsi Select SO (`cash`, `bank_transfer`, …). */
export function salesOrderPaymentMethodValue(m: PaymentMethodSetting): SoPaymentMethodSelect {
  const raw = `${m.code || ""} ${m.name || ""}`.toLowerCase();
  if (/cash|tunai/.test(raw)) return "cash";
  if (/transfer|bank|va\b|virtual/.test(raw)) return "bank_transfer";
  if (/kredit|credit/.test(raw)) return "credit_card";
  if (/debit/.test(raw)) return "debit_card";
  if (/qris|e.?wallet|e.?money|ovo|gopay|dana|shopee|tokopedia|saldo/.test(raw)) {
    return "e_wallet";
  }
  if (/cod|bayar di tempat/.test(raw)) return "cod";
  const code = normalizePaymentMethodCode(m.code || m.name);
  if (SO_PAYMENT_METHOD_SELECT.includes(code as SoPaymentMethodSelect)) {
    return code as SoPaymentMethodSelect;
  }
  return "other";
}

/** Tunai / cash — perlu input nominal & kembalian. */
export function isCashPaymentMethod(
  m?: Pick<PaymentMethodSetting, "name" | "code"> | null,
): boolean {
  if (!m) return false;
  const raw = `${m.code || ""} ${m.name || ""}`.toLowerCase();
  return /cash|tunai/.test(raw);
}

/** Map nilai tersimpan (id master atau opsi Select SO) → id master untuk dropdown form. */
export function resolvePaymentMethodSelectId(
  methods: PaymentMethodSetting[],
  stored?: string,
): string {
  if (!stored) return "";
  if (methods.some((m) => m.id === stored)) return stored;
  const bySelect = methods.find((m) => salesOrderPaymentMethodValue(m) === stored);
  if (bySelect) return bySelect.id;
  return findPaymentMethod(methods, stored)?.id ?? "";
}

export function paymentMethodLabel(
  methods: PaymentMethodSetting[],
  stored?: string,
  expanded?: { name?: string },
): string {
  if (expanded?.name) return expanded.name;
  if (!stored) return "—";
  return findPaymentMethod(methods, stored)?.name || stored;
}
