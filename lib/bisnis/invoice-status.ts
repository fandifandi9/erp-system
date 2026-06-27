import type { Invoice, InvoiceStatus } from "@/lib/bisnis/types";

/** Status tampilan (4 saja) */
export type InvoiceDisplayStatus = "unpaid" | "overdue" | "paid" | "cancelled";

export const INVOICE_STATUS_FILTER: { value: string; label: string; filter?: string }[] = [
  { value: "all", label: "Semua status" },
  {
    value: "unpaid",
    label: "Belum dibayar",
    filter: '(status = "unpaid" || status = "sent" || status = "draft")',
  },
  { value: "overdue", label: "Jatuh tempo", filter: 'status = "overdue"' },
  { value: "paid", label: "Lunas", filter: 'status = "paid"' },
  { value: "cancelled", label: "Dibatalkan", filter: 'status = "cancelled"' },
];

export const INVOICE_STATUS_UI: Record<
  InvoiceDisplayStatus,
  { label: string; cls: string; bannerCls: string; bannerText: string }
> = {
  unpaid: {
    label: "Belum dibayar",
    cls: "bg-amber-100 text-amber-800",
    bannerCls: "bg-amber-50 border-amber-200 text-amber-800",
    bannerText: "text-amber-700",
  },
  overdue: {
    label: "Jatuh tempo",
    cls: "bg-red-100 text-red-800",
    bannerCls: "bg-red-50 border-red-200 text-red-800",
    bannerText: "text-red-700",
  },
  paid: {
    label: "Lunas",
    cls: "bg-emerald-100 text-emerald-800",
    bannerCls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    bannerText: "text-emerald-700",
  },
  cancelled: {
    label: "Dibatalkan",
    cls: "bg-slate-100 text-slate-600",
    bannerCls: "bg-slate-50 border-slate-200 text-slate-600",
    bannerText: "text-slate-500",
  },
};

export function normalizeInvoiceStatus(status: InvoiceStatus | string): InvoiceDisplayStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "paid") return "paid";
  if (status === "overdue") return "overdue";
  return "unpaid";
}

export function getInvoiceDisplayStatus(
  inv: Pick<Invoice, "status" | "is_cash" | "issue_date" | "due_date" | "remaining">,
): InvoiceDisplayStatus {
  if (inv.status === "cancelled") return "cancelled";
  if (isCashInvoice(inv)) return "paid";
  return normalizeInvoiceStatus(inv.status);
}

/** Term 0 hari / cash — lunas langsung, bukan jatuh tempo */
export function isCashInvoice(
  inv: Pick<Invoice, "status" | "is_cash" | "issue_date" | "due_date" | "remaining">,
): boolean {
  if (inv.is_cash) return true;
  if (!inv.issue_date || !inv.due_date) return false;
  return inv.issue_date.slice(0, 10) === inv.due_date.slice(0, 10);
}

/** Perbaiki invoice cash lama yang statusnya salah (overdue/unpaid) */
export function shouldSyncCashInvoice(
  inv: Pick<Invoice, "status" | "is_cash" | "issue_date" | "due_date" | "remaining">,
): boolean {
  if (inv.status === "cancelled") return false;
  return isCashInvoice(inv) && inv.status !== "paid";
}

/** Tampilan list — tanpa write PB (sync DB hanya di detail). */
export function applyCashInvoiceDisplaySync(inv: Invoice): Invoice {
  if (!shouldSyncCashInvoice(inv)) return inv;
  return {
    ...inv,
    status: "paid",
    is_cash: true,
    paid_amount: inv.total,
    remaining: 0,
  };
}

export function statusFilterToPb(filter: string): string | undefined {
  return INVOICE_STATUS_FILTER.find((f) => f.value === filter)?.filter;
}

export function canEditInvoice(inv: Pick<Invoice, "status">): boolean {
  return inv.status !== "cancelled";
}

export function canCancelInvoice(inv: Pick<Invoice, "status">): boolean {
  return inv.status !== "cancelled";
}

/** Nilai untuk laporan laba rugi — dibatalkan tidak dihitung */
export function invoiceAmountForPL(inv: Pick<Invoice, "status" | "total">): number {
  if (inv.status === "cancelled") return 0;
  return inv.total ?? 0;
}
