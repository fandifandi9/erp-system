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

export function paymentMethodLabel(
  methods: PaymentMethodSetting[],
  stored?: string,
  expanded?: { name?: string },
): string {
  if (expanded?.name) return expanded.name;
  if (!stored) return "—";
  return findPaymentMethod(methods, stored)?.name || stored;
}
