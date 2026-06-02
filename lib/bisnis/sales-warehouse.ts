import { enqueueOutboundFromSalesOrder } from "@/lib/wms/fulfillment";
import {
  getOutboundStageFromSo,
  OUTBOUND_STAGE_UI,
  parseOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";
import { fetchSalesOrder, fetchSalesOrderLines, updateSalesOrder } from "./client";
import type { SalesOrder, SalesOrderStatus, WarehouseProcessStatus } from "./types";

export const SALES_WAREHOUSE_STATUS_UI: Record<
  WarehouseProcessStatus,
  { label: string; cls: string }
> = {
  pending: { label: "Menunggu picking", cls: "bg-slate-100 text-slate-700" },
  checking: { label: "Sedang picking", cls: "bg-blue-100 text-blue-800" },
  hold: { label: "Hold picking", cls: "bg-amber-100 text-amber-900" },
  processing: { label: "Packing", cls: "bg-indigo-100 text-indigo-800" },
  complete: { label: "Siap kirim", cls: "bg-cyan-100 text-cyan-900" },
};

const SO_FULFILLMENT_UI: Partial<Record<SalesOrderStatus, { label: string; cls: string }>> = {
  shipped: { label: "Dikirim", cls: "bg-violet-100 text-violet-800" },
  delivered: { label: "Terkirim", cls: "bg-emerald-100 text-emerald-800" },
};

export function getSalesWarehouseStatus(
  so: Pick<SalesOrder, "warehouse_process_status" | "send_to_warehouse_at">,
): WarehouseProcessStatus | null {
  if (!so.send_to_warehouse_at && !so.warehouse_process_status) return null;
  return so.warehouse_process_status ?? "pending";
}

/** Label WMS di daftar SO: picking → validasi → packing → pickup. */
export function getSalesWmsDisplayStatus(
  so: Pick<
    SalesOrder,
    "send_to_warehouse_at" | "warehouse_process_status" | "status" | "outbound_workflow_json"
  >,
): { label: string; cls: string } | null {
  if (!so.send_to_warehouse_at && !so.warehouse_process_status) return null;

  if (so.outbound_workflow_json) {
    const stage = getOutboundStageFromSo(so);
    return OUTBOUND_STAGE_UI[stage];
  }

  const ship = SO_FULFILLMENT_UI[so.status];
  if (ship) return ship;

  const wh = getSalesWarehouseStatus(so);
  if (wh) return SALES_WAREHOUSE_STATUS_UI[wh];
  return SALES_WAREHOUSE_STATUS_UI.pending;
}

export function canSendSalesOrderToWarehouse(
  so: Pick<SalesOrder, "status" | "send_to_warehouse_at" | "warehouse">,
): boolean {
  if (!so.warehouse) return false;
  if (so.status === "cancelled" || so.status === "delivered") return false;
  if (so.send_to_warehouse_at) return false;
  return so.status === "draft" || so.status === "confirmed" || so.status === "processing";
}

export function canCreateInvoiceFromSalesOrder(
  so: Pick<
    SalesOrder,
    "status" | "send_to_warehouse_at" | "warehouse_process_status"
  >,
): boolean {
  if (so.status === "cancelled") return false;
  if (!so.send_to_warehouse_at) return true;
  return so.warehouse_process_status === "complete";
}

export function invoiceBlockedReason(
  so: Pick<
    SalesOrder,
    | "status"
    | "send_to_warehouse_at"
    | "warehouse_process_status"
    | "warehouse"
    | "warehouse_hold_note"
  >,
): string | null {
  if (so.status === "cancelled") return "SO dibatalkan.";
  if (so.warehouse_process_status === "hold") {
    return so.warehouse_hold_note
      ? `SO di-hold gudang: ${so.warehouse_hold_note}`
      : "SO di-hold gudang — selesaikan di WMS.";
  }
  if (!so.send_to_warehouse_at) return null;
  const wh = getSalesWarehouseStatus(so);
  if (wh === "hold") {
    return "Gudang masih Hold — selesaikan picking/packing dulu.";
  }
  if (wh !== "complete") {
    return "Proses gudang belum selesai — invoice manual belum bisa dibuat.";
  }
  return null;
}

/** Admin bisnis: kirim SO ke antrean picking gudang. */
export async function sendSalesOrderToWarehouse(
  soId: string,
  userId: string,
): Promise<SalesOrder> {
  const so = await fetchSalesOrder(soId);
  if (!canSendSalesOrderToWarehouse(so)) {
    throw new Error("SO tidak bisa dikirim ke picking (sudah terkirim, dibatalkan, atau tanpa gudang).");
  }
  const lines = await fetchSalesOrderLines(soId);
  if (lines.length === 0) throw new Error("SO tidak punya item produk.");

  let updated = so;
  const now = new Date().toISOString();
  try {
    updated = await updateSalesOrder(soId, {
      send_to_warehouse_at: now,
      warehouse_process_status: "pending",
    });
  } catch {
    // schema lama: field WMS SO belum tersedia, lanjut enqueue task
  }
  await enqueueOutboundFromSalesOrder(soId, userId);
  return updated;
}

export function salesOrdersPickingPbFilter(): string {
  return (
    'send_to_warehouse_at != "" && warehouse_process_status != "complete" && ' +
    'status != "cancelled" && status != "delivered"'
  );
}
