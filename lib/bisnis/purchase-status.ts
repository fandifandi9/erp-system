import type { PurchaseBill, PurchaseBillStatus } from "@/lib/bisnis/types";

export type PurchaseDisplayStatus = "unpaid" | "overdue" | "paid" | "cancelled";

export const PURCHASE_STATUS_FILTER: { value: string; label: string; filter?: string }[] = [
  { value: "all", label: "Semua status" },
  {
    value: "unpaid",
    label: "Belum dibayar",
    filter: '(status = "unpaid" || status = "received" || status = "draft")',
  },
  { value: "overdue", label: "Jatuh tempo", filter: 'status = "overdue"' },
  { value: "paid", label: "Lunas", filter: 'status = "paid"' },
  { value: "cancelled", label: "Dibatalkan", filter: 'status = "cancelled"' },
];

export const PURCHASE_STATUS_UI: Record<PurchaseDisplayStatus, { label: string; cls: string }> = {
  unpaid: { label: "Belum dibayar", cls: "bg-amber-100 text-amber-800" },
  overdue: { label: "Jatuh tempo", cls: "bg-red-100 text-red-800" },
  paid: { label: "Lunas", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Dibatalkan", cls: "bg-slate-100 text-slate-600" },
};

export function isCashPurchase(
  bill: Pick<PurchaseBill, "is_cash" | "bill_date" | "due_date">,
): boolean {
  if (bill.is_cash) return true;
  if (!bill.bill_date || !bill.due_date) return false;
  return bill.bill_date.slice(0, 10) === bill.due_date.slice(0, 10);
}

export function getPurchaseDisplayStatus(
  bill: Pick<PurchaseBill, "status" | "is_cash" | "bill_date" | "due_date">,
): PurchaseDisplayStatus {
  if (bill.status === "cancelled") return "cancelled";
  if (isCashPurchase(bill) || bill.status === "paid") return "paid";
  if (bill.status === "overdue") return "overdue";
  return "unpaid";
}

export function purchaseFilterToPb(filter: string): string | undefined {
  return PURCHASE_STATUS_FILTER.find((f) => f.value === filter)?.filter;
}

export function canEditPurchaseBill(bill: Pick<PurchaseBill, "status">): boolean {
  return getPurchaseDisplayStatus(bill) !== "cancelled";
}

export function canCancelPurchaseBill(bill: Pick<PurchaseBill, "status">): boolean {
  return getPurchaseDisplayStatus(bill) !== "cancelled";
}
