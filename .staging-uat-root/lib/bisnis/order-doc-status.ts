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
  so: Pick<SalesOrder, "status" | "send_to_warehouse_at">,
): OrderDocDisplayStatus {
  if (so.status === "cancelled") return "cancelled";
  /** Proses gudang tanpa invoice — tetap draf di tab Pesanan. */
  if (so.status === "processing" && so.send_to_warehouse_at) return "draft";
  if (SO_FINISHED.includes(so.status)) return "finished";
  return "draft";
}

export function canEditPurchaseOrderDoc(po: Pick<PurchaseOrder, "status">): boolean {
  return getPurchaseOrderDocStatus(po) === "draft";
}

export function canEditSalesOrderDoc(
  so: Pick<SalesOrder, "status" | "send_to_warehouse_at">,
): boolean {
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

/** Filter tab Pesanan — hanya draf & dibatalkan (SO/PO yang sudah jadi invoice/bill disembunyikan). */
export const OPEN_ORDER_DOC_STATUS_FILTER = [
  { value: "all", label: "Semua" },
  { value: "draft", label: "Draf" },
  { value: "cancelled", label: "Dibatalkan" },
] as const;

/** SO masih terbuka: draf, proses gudang (belum invoice), atau dibatalkan. */
const SO_OPEN_LIST =
  '(status = "draft" || status = "processing" || status = "cancelled")';

const PO_OPEN_DRAFT =
  '(status = "draft" || status = "sent" || status = "confirmed" || status = "partial_received")';

const PO_OPEN_LIST =
  '(status = "draft" || status = "sent" || status = "confirmed" || status = "partial_received" || status = "cancelled")';

/** Daftar SO di tab Pesanan — exclude yang sudah confirmed/delivered (sudah punya invoice). */
export function openSalesOrdersListFilterToPb(filter: string): string | undefined {
  if (filter === "draft") return '(status = "draft" || status = "processing")';
  if (filter === "cancelled") return 'status = "cancelled"';
  return SO_OPEN_LIST;
}

/** Daftar PO di tab Pesanan — exclude yang sudah received (sudah punya tagihan). */
export function openPurchaseOrdersListFilterToPb(filter: string): string | undefined {
  if (filter === "draft") return PO_OPEN_DRAFT;
  if (filter === "cancelled") return 'status = "cancelled"';
  return PO_OPEN_LIST;
}
