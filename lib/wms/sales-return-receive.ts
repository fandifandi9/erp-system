import type PocketBase from "pocketbase";
import { postReturnStockMovementServer } from "@/lib/inventory/retur-stock-server";
import { ensureTransitWarehouse } from "@/lib/bisnis/entity-modules";
import { resolveSalesReturCompanyId } from "@/lib/bisnis/retur-company";
import { resolveProcessActorName } from "@/lib/bisnis/process-actor";
import { reminderDueAtIso } from "@/lib/bisnis/retur-workflow";
import { BISNIS_COLLECTIONS, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type ReceiveLine = { product: string; qty: number; sku?: string; name?: string };

async function logReceiveTask(
  pb: PocketBase,
  input: {
    userId: string;
    warehouseId: string;
    returId: string;
    payload: Record<string, unknown>;
  },
) {
  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: input.userId,
      warehouse: input.warehouseId,
      activity_type: "wms.sales_return_receive",
      entity_type: "biz_returs",
      entity_id: input.returId,
      payload: input.payload,
      occurred_at: new Date().toISOString(),
      device_platform: "web",
    });
  } catch {
    /* audit opsional */
  }
}

/** Antrean WMS saat retur penjualan dibuat — belum posting stok. */
export async function enqueueSalesReturnWmsTaskOnCreate(
  pb: PocketBase,
  input: {
    retur: Retur;
    lines: ReturLine[];
    soOrderNo?: string;
    userId: string;
    transitWarehouseId: string;
  },
) {
  const receiveLines: ReceiveLine[] = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => ({
      product: l.product,
      qty: l.qty,
      sku: l.expand?.product?.sku,
      name: l.expand?.product?.name,
    }));

  await logReceiveTask(pb, {
    userId: input.userId,
    warehouseId: input.transitWarehouseId,
    returId: input.retur.id,
    payload: {
      retur_no: input.retur.retur_no,
      so_order_no: input.soOrderNo ?? "",
      reason: input.retur.reason ?? "",
      status: "pending",
      note: "Menunggu penerimaan fisik retur penjualan di gudang.",
      lines: receiveLines,
    },
  });
}

export type WmsReceivedReturLine = {
  line_id?: string;
  product: string;
  qty: number;
  condition?: "good" | "damaged";
};

export type ReceiveSalesReturnAtWmsInput = {
  returId: string;
  userId: string;
  unboxing_video_path?: string;
  received_lines?: WmsReceivedReturLine[];
  wms_note?: string;
  /** Cocok/tidak dengan claim bisnis — terpisah dari kondisi aktual barang. */
  claim_decision: "agree" | "disagree";
  dispute_note?: string;
};

function resolveReceivedLine(
  line: ReturLine,
  received: WmsReceivedReturLine[] | undefined,
): WmsReceivedReturLine | undefined {
  if (!received?.length) return undefined;
  const byId = received.find((r) => r.line_id === line.id);
  if (byId) return byId;
  return received.find((r) => r.product === line.product);
}

function expectedCondition(line: ReturLine): "good" | "damaged" {
  return line.expected_condition === "damaged" || line.condition === "damaged" ? "damaged" : "good";
}

function resolveActualCondition(
  line: ReturLine,
  recv: WmsReceivedReturLine | undefined,
): "good" | "damaged" {
  if (recv?.condition === "good" || recv?.condition === "damaged") return recv.condition;
  return expectedCondition(line);
}

/**
 * WMS terima retur penjualan → stok ke gudang sementara (hold).
 * Retur tetap terbuka (draft / awaiting_business) sampai putusan final bisnis.
 * Kondisi aktual per baris dari WMS; claim agree/disagree tidak memaksa good/damaged.
 */
export async function receiveSalesReturnAtWms(
  pb: PocketBase,
  input: ReceiveSalesReturnAtWmsInput,
): Promise<Retur> {
  const decision = input.claim_decision;
  if (decision !== "agree" && decision !== "disagree") {
    throw new Error("Keputusan claim WMS wajib: setuju atau bantah.");
  }
  if (decision === "disagree" && (input.dispute_note?.trim().length ?? 0) < 5) {
    throw new Error("Alasan bantah claim wajib diisi (min. 5 karakter).");
  }

  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(input.returId);
  if (retur.type !== "penjualan") {
    throw new Error("Bukan retur penjualan.");
  }
  if (retur.status === "completed" || retur.status === "cancelled") {
    throw new Error("Retur sudah selesai atau dibatalkan.");
  }
  if (retur.wms_receive_status === "complete") {
    throw new Error("Retur sudah diterima WMS (hold). Tunggu putusan bisnis.");
  }
  if (retur.workflow_phase === "completed" || retur.workflow_phase === "resend") {
    throw new Error("Retur tidak lagi menunggu penerimaan WMS.");
  }

  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: `retur = "${input.returId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
  if (!lines.length) throw new Error("Retur tidak punya barang.");

  const soId = retur.sales_order || retur.reference_id;
  const companyId = await resolveSalesReturCompanyId(pb, retur, soId ?? undefined);

  if (!companyId) {
    throw new Error(
      "Entitas retur tidak terdeteksi. Pastikan SO terhubung gudang/toko dengan entitas PT/CV.",
    );
  }

  const transit = await ensureTransitWarehouse(companyId, pb);

  const stockLines: { product: string; qty: number }[] = [];

  for (const line of lines) {
    const recv = resolveReceivedLine(line, input.received_lines);
    const expectedQty = Number(line.qty) || 0;
    const actualQty = recv
      ? Math.min(expectedQty, Math.max(0, Number(recv.qty) || 0))
      : expectedQty;
    const actualCondition = resolveActualCondition(line, recv);

    if (actualQty > 0) {
      stockLines.push({ product: line.product, qty: actualQty });
    }

    await pb.collection(BISNIS_COLLECTIONS.returLines).update(line.id, {
      actual_qty: actualQty,
      actual_condition: actualCondition,
      condition: actualCondition,
    });
  }

  if (!stockLines.length) throw new Error("Tidak ada qty diterima.");

  const { resolveReturnLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
  const expanded = await resolveReturnLinesFromSale(pb, stockLines);

  await postReturnStockMovementServer({
    pb,
    to_warehouse: transit.id,
    reference_type: "SALES_RETURN",
    reference_id: retur.id,
    reference_no: retur.retur_no,
    lines: expanded,
    userId: input.userId,
    noteSuffix: "Penerimaan WMS → gudang sementara (hold, belum putusan final)",
  });

  const now = new Date().toISOString();
  const tasks = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
    filter: `entity_type = "biz_returs" && entity_id = "${input.returId}" && activity_type = "wms.sales_return_receive"`,
    requestKey: null,
  });
  for (const row of tasks) {
    const r = row as { id: string; payload?: Record<string, unknown> };
    if (r.payload?.status === "cancelled") continue;
    try {
      await pb.collection(INV_COLLECTIONS.staffActivities).update(r.id, {
        payload: {
          ...(r.payload ?? {}),
          status: "received_hold",
          completed_by: input.userId,
          wms_note: input.wms_note,
          unboxing_video_path: input.unboxing_video_path,
          claim_decision: decision,
          dispute_note: input.dispute_note,
          note: "Diterima WMS — hold gudang sementara sampai putusan bisnis",
        },
      });
    } catch {
      /* ignore */
    }
  }

  // Jangan completed/cancelled — hanya hold transit + klarifikasi bisnis.
  const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(input.returId, {
    wms_receive_status: "complete",
    wms_received_at: now,
    warehouse: transit.id,
    unboxing_video_path: input.unboxing_video_path || retur.unboxing_video_path,
    wms_claim_decision: decision,
    wms_dispute_note: decision === "disagree" ? input.dispute_note?.trim() || "" : "",
    ...(input.wms_note?.trim() ? { wms_note: input.wms_note.trim() } : {}),
    workflow_phase: "awaiting_business",
    exception_status: decision === "disagree" ? "open" : "none",
    wms_exception_summary: decision === "disagree" ? input.dispute_note?.trim() || "" : "",
    reminder_due_at: reminderDueAtIso(),
    wms_processed_by: input.userId,
    wms_processed_by_name: await resolveProcessActorName(pb, input.userId),
    wms_process_completed_at: now,
    ...(retur.wms_process_started_at ? {} : { wms_process_started_at: now }),
  });

  return updated;
}

/** Catat mulai proses WMS (saat operator buka / lanjut penerimaan). */
export async function markSalesReturnWmsProcessStarted(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.wms_process_started_at) return retur;
  const actorName = await resolveProcessActorName(pb, userId);
  return pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    wms_process_started_at: new Date().toISOString(),
    wms_processed_by: userId,
    wms_processed_by_name: actorName,
  });
}

/** @deprecated — gunakan receiveSalesReturnAtWms */
export async function completeSalesReturnWmsReceive(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<Retur> {
  return receiveSalesReturnAtWms(pb, { returId, userId, claim_decision: "agree" });
}

export {
  salesReturnsReceivingPbFilter,
} from "@/lib/bisnis/retur-workflow";

/** Legacy enqueue setelah complete — tidak dipakai alur baru. */
export async function enqueueInboundFromSalesReturnServer(
  pb: PocketBase,
  input: {
    returId: string;
    returNo: string;
    warehouseId: string;
    damagedWarehouseId?: string;
    userId: string;
    goodLines: ReceiveLine[];
    damagedLines: ReceiveLine[];
    soOrderNo?: string;
  },
) {
  void pb;
  void input;
}
