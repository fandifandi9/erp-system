import type { PurchaseOrder, PurchaseOrderStatus, SalesOrder, SalesOrderStatus } from "./types";

/** Status tampilan PO/SO di daftar: Draf (belum jadi tagihan/invoice) vs Selesai. */
export type OrderDocDisplayStatus = "draft" | "finished" | "cancelled";

export const ORDER_DOC_STATUS_UI: Record<
  OrderDocDisplayStatus,
  { label: string; cls: string }
> = {
  draft: { label: "Draf", cls: "bg-amber-100 text-amber-800" },
  finished: { label: "Selesai", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Dibatalkan", cls: "bg-slate-100 text-slate-600" },
};

const PO_FINISHED: PurchaseOrderStatus[] = ["received"];
const SO_FINISHED: SalesOrderStatus[] = ["confirmed", "processing", "shipped", "delivered"];

export function getPurchaseOrderDocStatus(
  po: Pick<PurchaseOrder, "status">,
): OrderDocDisplayStatus {
  if (po.status === "cancelled") return "cancelled";
  if (PO_FINISHED.includes(po.status)) return "finished";
  return "draft";
}

export function getSalesOrderDocStatus(
  so: Pick<SalesOrder, "status">,
): OrderDocDisplayStatus {
  if (so.status === "cancelled") return "cancelled";
  if (SO_FINISHED.includes(so.status)) return "finished";
  return "draft";
}

export function canEditPurchaseOrderDoc(po: Pick<PurchaseOrder, "status">): boolean {
  return getPurchaseOrderDocStatus(po) === "draft";
}

export function canEditSalesOrderDoc(so: Pick<SalesOrder, "status">): boolean {
  return getSalesOrderDocStatus(so) === "draft";
}

export function purchaseOrderFilterToPb(filter: string): string | undefined {
  if (filter === "all") return undefined;
  if (filter === "draft") {
    return '(status = "draft" || status = "sent" || status = "confirmed" || status = "partial_received")';
  }
  if (filter === "finished") return 'status = "received"';
  if (filter === "cancelled") return 'status = "cancelled"';
  return `status = "${filter}"`;
}

export function salesOrderFilterToPb(filter: string): string | undefined {
  if (filter === "all") return undefined;
  if (filter === "draft") return 'status = "draft"';
  if (filter === "finished") {
    return '(status = "confirmed" || status = "processing" || status = "shipped" || status = "delivered")';
  }
  if (filter === "cancelled") return 'status = "cancelled"';
  return `status = "${filter}"`;
}

export const ORDER_DOC_STATUS_FILTER = [
  { value: "all", label: "Semua status" },
  { value: "draft", label: "Draf" },
  { value: "finished", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;
