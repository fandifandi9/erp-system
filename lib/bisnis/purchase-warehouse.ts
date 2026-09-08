import { enqueueInboundFromPurchaseOrder } from "@/lib/wms/fulfillment";
import {
  parseReceivingWorkflow,
  validateReceivingWorkflowComplete,
} from "@/lib/wms/receiving-workflow";
import {
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  updatePurchaseOrder,
} from "./client";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS } from "./types";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  WarehouseProcessMode,
  WarehouseProcessStatus,
} from "./types";

export const WAREHOUSE_PROCESS_STATUS_UI: Record<
  WarehouseProcessStatus,
  { label: string; labelKey: string; cls: string }
> = {
  pending: {
    label: "Menunggu gudang",
    labelKey: "inventory.whStatus.pending",
    cls: "bg-slate-100 text-slate-700",
  },
  checking: {
    label: "Sedang dicek",
    labelKey: "inventory.whStatus.checking",
    cls: "bg-blue-100 text-blue-800",
  },
  hold: { label: "Hold", labelKey: "inventory.whStatus.hold", cls: "bg-amber-100 text-amber-900" },
  processing: {
    label: "Sedang diproses",
    labelKey: "inventory.whStatus.processing",
    cls: "bg-indigo-100 text-indigo-800",
  },
  complete: {
    label: "Selesai",
    labelKey: "inventory.whStatus.complete",
    cls: "bg-emerald-100 text-emerald-800",
  },
};

export function getWarehouseProcessStatus(
  po: Pick<PurchaseOrder, "warehouse_process_status" | "send_to_warehouse_at">,
): WarehouseProcessStatus | null {
  if (!po.send_to_warehouse_at && !po.warehouse_process_status) return null;
  return po.warehouse_process_status ?? "pending";
}

export function canSendPurchaseOrderToWarehouse(
  po: Pick<PurchaseOrder, "status" | "send_to_warehouse_at" | "warehouse">,
): boolean {
  if (!po.warehouse) return false;
  if (po.status === "cancelled" || po.status === "received") return false;
  if (po.send_to_warehouse_at) return false;
  return po.status === "draft" || po.status === "sent" || po.status === "confirmed";
}

export function canCreateBillFromPurchaseOrder(
  po: Pick<
    PurchaseOrder,
    | "status"
    | "send_to_warehouse_at"
    | "warehouse_process_status"
    | "receiving_business_status"
  >,
): boolean {
  if (po.status === "cancelled" || po.status === "received") return false;
  if (!po.send_to_warehouse_at) return true;
  if (po.warehouse_process_status !== "complete") return false;
  if (po.receiving_business_status === "awaiting_business") return false;
  return true;
}

export function billBlockedReason(
  po: Pick<
    PurchaseOrder,
    | "status"
    | "send_to_warehouse_at"
    | "warehouse_process_status"
    | "warehouse"
    | "receiving_business_status"
  >,
): string | null {
  if (po.status === "cancelled") return "PO dibatalkan.";
  if (!po.warehouse) return "PO belum punya gudang tujuan.";
  if (!po.send_to_warehouse_at) return null;
  const wh = getWarehouseProcessStatus(po);
  if (wh === "hold") {
    return "Gudang masih Hold — tunggu proses QC selesai (Komplit).";
  }
  if (wh !== "complete") {
    return "Proses gudang belum Komplit — tagihan belum bisa dibuat.";
  }
  if (po.receiving_business_status === "awaiting_business") {
    return "Stok sudah di gudang sementara — selesaikan klarifikasi penerimaan terlebih dahulu.";
  }
  return null;
}

/** Label WMS di daftar PO: penerimaan → input stok. */
export function getPurchaseWmsDisplayStatus(
  po: Pick<
    PurchaseOrder,
    "send_to_warehouse_at" | "warehouse_process_status" | "status"
  >,
): { badgeId: string; label: string; labelKey: string; cls: string } | null {
  if (!po.send_to_warehouse_at && !po.warehouse_process_status) return null;
  if (po.status === "received") {
    return {
      badgeId: "po_received",
      label: "Stok masuk",
      labelKey: "wms.badge.po_received",
      cls: "bg-emerald-100 text-emerald-800",
    };
  }
  const wh = getWarehouseProcessStatus(po);
  if (wh) return { ...WAREHOUSE_PROCESS_STATUS_UI[wh], badgeId: `wh_${wh}` };
  return { ...WAREHOUSE_PROCESS_STATUS_UI.pending, badgeId: "wh_pending" };
}

/** Admin bisnis: kirim PO ke antrean penerimaan gudang. */
export async function sendPurchaseOrderToWarehouse(
  poId: string,
  userId: string,
): Promise<PurchaseOrder> {
  const po = await fetchPurchaseOrder(poId);
  if (!canSendPurchaseOrderToWarehouse(po)) {
    throw new Error("PO tidak bisa dikirim ke gudang (sudah terkirim, dibatalkan, atau tanpa gudang).");
  }
  const lines = await fetchPurchaseOrderLines(poId);
  if (lines.length === 0) {
    throw new Error("PO tidak punya item produk.");
  }

  const now = new Date().toISOString();
  const updated = await updatePurchaseOrder(poId, {
    status: po.status === "draft" ? "sent" : po.status,
    send_to_warehouse_at: now,
    warehouse_process_status: "pending",
  });

  await enqueueInboundFromPurchaseOrder(poId, userId);
  return updated;
}

export type WarehouseProcessAction = "start_check" | "hold" | "complete";

export type WarehouseProcessOpts = {
  note?: string;
  receiving_warehouse?: string;
  surat_jalan_no?: string;
  surat_jalan_verified?: boolean;
  process_mode?: WarehouseProcessMode;
  /** Wajib saat complete — hindari race dengan autosave QC di browser. */
  receiving_workflow_json?: string;
};

/** Browser: panggil API server (admin PB untuk posting stok). */
export async function updateWarehouseProcessApi(
  poId: string,
  action: WarehouseProcessAction,
  opts?: WarehouseProcessOpts,
): Promise<PurchaseOrder> {
  const res = await fetch(`/api/bisnis/purchase-orders/${encodeURIComponent(poId)}/warehouse-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, ...opts }),
  });
  const data = (await res.json()) as { ok?: boolean; data?: PurchaseOrder; error?: string };
  if (!res.ok || !data.ok || !data.data) {
    throw new Error(data.error || "Gagal menyimpan proses gudang.");
  }
  return data.data;
}

export async function updateWarehouseProcess(
  poId: string,
  userId: string,
  action: WarehouseProcessAction,
  opts?: WarehouseProcessOpts,
): Promise<PurchaseOrder> {
  // Server-only: admin PB (kredensial .env.local). Jangan panggil dari browser.
  const pb = await getInventoryAdminPb();
  let po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
  if (!po.send_to_warehouse_at) {
    throw new Error("PO belum dikirim ke gudang.");
  }
  if (po.status === "cancelled" || po.status === "received") {
    throw new Error("PO sudah selesai atau dibatalkan.");
  }

  const now = new Date().toISOString();
  const base: Partial<PurchaseOrder> = {
    warehouse_processed_by: userId,
    warehouse_processed_at: now,
    ...(opts?.surat_jalan_no !== undefined ? { surat_jalan_no: opts.surat_jalan_no } : {}),
    ...(opts?.surat_jalan_verified !== undefined
      ? { surat_jalan_verified: opts.surat_jalan_verified }
      : {}),
  };

  if (action === "start_check") {
    return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(poId, {
      ...base,
      warehouse_process_status: "checking",
      warehouse_received_at: po.warehouse_received_at ?? now,
    });
  }

  if (action === "hold") {
    return pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(poId, {
      ...base,
      warehouse_process_status: "hold",
      warehouse_process_mode: "hold",
      warehouse_hold_note: opts?.note?.trim() || undefined,
      receiving_warehouse: opts?.receiving_warehouse || po.receiving_warehouse,
      warehouse_received_at: po.warehouse_received_at ?? now,
    });
  }

  const poLines = await pb
    .collection(BISNIS_COLLECTIONS.purchaseOrderLines)
    .getFullList<PurchaseOrderLine>({
      filter: `purchase_order = "${poId.replace(/"/g, '\\"')}"`,
      expand: "product",
      sort: "created",
      requestKey: null,
    });

  if (opts?.receiving_workflow_json) {
    po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(poId, {
      receiving_workflow_json: opts.receiving_workflow_json,
    });
  }

  const wf = parseReceivingWorkflow(po.receiving_workflow_json);
  const wfErr = validateReceivingWorkflowComplete(poLines, wf);
  if (wfErr) throw new Error(wfErr);

  // Posting stok dulu — baru tandai Komplit. Hindari status tersimpan + error stok.
  const { postWmsPurchaseReceivingToTransit } = await import("./purchase-receiving-finalize");
  await postWmsPurchaseReceivingToTransit(poId, userId);

  const updated = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(poId, {
    ...base,
    warehouse_process_status: "complete",
    warehouse_process_mode: opts?.process_mode ?? po.warehouse_process_mode ?? "direct",
    warehouse_hold_note:
      po.warehouse_process_status === "hold" ? po.warehouse_hold_note : undefined,
  });

  await emitBusinessEventServer(pb, {
    event_code: "warehouse.receiving.completed",
    module: "warehouse",
    entity_type: "biz_purchase_orders",
    entity_id: poId,
    entity_label: po.po_no,
    warehouse_id: po.warehouse,
    payload: { ref: po.po_no, po_no: po.po_no },
    actor_id: userId,
  });

  return updated;
}

export function purchaseOrdersReceivingPbFilter(): string {
  return (
    'send_to_warehouse_at != "" && warehouse_process_status != "complete" && ' +
    'status != "cancelled" && status != "received"'
  );
}

export function fmtWarehouseProcessedAt(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
