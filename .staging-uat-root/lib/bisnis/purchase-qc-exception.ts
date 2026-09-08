import type { PurchaseOrder } from "@/lib/bisnis/types";

export type QcExceptionSummary = {
  exception_type?: string;
  reasons?: string[];
  recorded_at?: string;
};

export function hasOpenPurchaseQcException(
  po: Pick<
    PurchaseOrder,
    "receiving_business_status" | "receiving_discrepancy" | "exception_status"
  >,
): boolean {
  if (po.exception_status === "open") return true;
  return (
    po.receiving_business_status === "awaiting_business" && Boolean(po.receiving_discrepancy)
  );
}

export function parseQcExceptionSummary(raw?: string | null): QcExceptionSummary | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as QcExceptionSummary;
  } catch {
    return null;
  }
}

export function purchaseQcExceptionBadge(po: Pick<PurchaseOrder, "receiving_business_status" | "receiving_discrepancy" | "exception_status">): {
  label: string;
  cls: string;
} | null {
  if (!hasOpenPurchaseQcException(po)) return null;
  return {
    label: "QC Exception",
    cls: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  };
}
