import type { PurchaseOrder, SalesOrder } from "./types";
import {
  getPurchaseWmsDisplayStatus,
  getWarehouseProcessStatus,
} from "./purchase-warehouse";
import { getSalesWmsDisplayStatus } from "./sales-warehouse";

export const WMS_ROUTE_FILTER = [
  { value: "all", label: "Semua proses gudang" },
  { value: "bypass", label: "Belum ke antrean WMS" },
  { value: "active", label: "Lewat gudang" },
  { value: "wms_pending", label: "Gudang: menunggu" },
  { value: "wms_progress", label: "Gudang: proses" },
  { value: "wms_complete", label: "Gudang: komplit" },
] as const;

export type WmsRouteFilterValue = (typeof WMS_ROUTE_FILTER)[number]["value"];

type WmsOrderFields = Pick<
  SalesOrder | PurchaseOrder,
  "send_to_warehouse_at" | "warehouse_process_status" | "status"
>;

/** Filter PocketBase untuk field langsung di SO/PO. */
export function wmsOrderFilterToPb(filter: string, fieldPrefix = ""): string | undefined {
  if (filter === "all" || !filter) return undefined;
  const p = fieldPrefix ? `${fieldPrefix}.` : "";

  if (filter === "bypass") {
    return `(${p}send_to_warehouse_at = "" || ${p}send_to_warehouse_at = null)`;
  }
  if (filter === "active") {
    return `${p}send_to_warehouse_at != ""`;
  }
  if (filter === "wms_pending") {
    return (
      `${p}send_to_warehouse_at != "" && ` +
      `(${p}warehouse_process_status = "pending" || ${p}warehouse_process_status = "" || ${p}warehouse_process_status = null)`
    );
  }
  if (filter === "wms_progress") {
    return (
      `${p}send_to_warehouse_at != "" && ` +
      `(${p}warehouse_process_status = "checking" || ${p}warehouse_process_status = "hold" || ${p}warehouse_process_status = "processing")`
    );
  }
  if (filter === "wms_complete") {
    return `${p}send_to_warehouse_at != "" && ${p}warehouse_process_status = "complete"`;
  }
  return undefined;
}

export function invoiceWmsFilterToPb(filter: string): string | undefined {
  return wmsOrderFilterToPb(filter, "sales_order");
}

export function purchaseBillWmsFilterToPb(filter: string): string | undefined {
  return wmsOrderFilterToPb(filter, "purchase_order");
}

export function getWmsRouteBadge(
  order: WmsOrderFields | null | undefined,
  kind: "sales" | "purchase",
): { label: string; cls: string } {
  if (!order) {
    return { label: "—", cls: "bg-slate-100 text-slate-400" };
  }
  const ui =
    kind === "sales"
      ? getSalesWmsDisplayStatus(order as SalesOrder)
      : getPurchaseWmsDisplayStatus(order as PurchaseOrder);
  if (!ui) {
    const hasWarehouse =
      "warehouse" in order && !!(order as SalesOrder | PurchaseOrder).warehouse;
    if (hasWarehouse) {
      return { label: "Belum ke antrean", cls: "bg-amber-50 text-amber-800" };
    }
    return { label: "Gudang belum dipilih", cls: "bg-slate-100 text-slate-500" };
  }
  return ui;
}

/** True bila filter PB gagal karena field WMS belum ada di collection. */
export function isWmsSchemaFilterError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("send_to_warehouse") ||
    msg.includes("warehouse_process") ||
    msg.includes("unknown filter") ||
    msg.includes("invalid filter") ||
    msg.includes("filter syntax")
  );
}

export function matchesWmsRouteFilter(
  order: WmsOrderFields | null | undefined,
  filter: string,
  kind: "sales" | "purchase",
): boolean {
  if (filter === "all" || !filter) return true;
  if (!order) return filter === "bypass";

  const sent = !!order.send_to_warehouse_at;

  if (kind === "sales") {
    const so = order as SalesOrder;
    if (filter === "bypass") return !sent && !so.warehouse_process_status;
    if (filter === "active") return sent;
    if (filter === "wms_pending") return sent && (so.warehouse_process_status === "pending" || !so.warehouse_process_status);
    if (filter === "wms_progress") {
      return (
        sent &&
        (so.warehouse_process_status === "checking" ||
          so.warehouse_process_status === "hold" ||
          so.warehouse_process_status === "processing" ||
          so.status === "processing" ||
          so.status === "shipped")
      );
    }
    if (filter === "wms_complete") {
      return (
        sent &&
        (so.warehouse_process_status === "complete" ||
          so.status === "delivered")
      );
    }
    return true;
  }

  const po = order as PurchaseOrder;
  const wh = getWarehouseProcessStatus(po);
  if (filter === "bypass") return !sent && !po.warehouse_process_status;
  if (filter === "active") return sent;
  if (filter === "wms_pending") return sent && (wh === "pending" || wh === null);
  if (filter === "wms_progress") return sent && (wh === "checking" || wh === "hold" || wh === "processing");
  if (filter === "wms_complete") return sent && (wh === "complete" || po.status === "received");
  return true;
}
