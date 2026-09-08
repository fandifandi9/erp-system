import type PocketBase from "pocketbase";
import { analyzeSalesReturWmsReceive } from "@/lib/core/expected-actual";
import {
  exceptionStatusForMatch,
  notifyBusinessException,
} from "@/lib/core/transaction-exception";
import { postReturnStockMovementServer } from "@/lib/inventory/retur-stock-server";
import { ensureTransitWarehouse } from "@/lib/bisnis/entity-modules";
import { resolveSalesReturCompanyId } from "@/lib/bisnis/retur-company";
import { autoFinalizeSalesReturAfterWms } from "@/lib/bisnis/sales-retur-wms-finalize";
import { BISNIS_COLLECTIONS, type Retur, type ReturLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { reminderDueAtIso } from "@/lib/bisnis/retur-workflow";

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

/**
 * WMS terima retur penjualan: catat actual → transit → compare expected vs actual.
 * Match → auto transfer ke gudang akhir + pembukuan (tanpa notifikasi exception).
 * Mismatch → awaiting_business + exception notifikasi.
 */
export async function receiveSalesReturnAtWms(
  pb: PocketBase,
  input: ReceiveSalesReturnAtWmsInput,
): Promise<Retur> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(input.returId);
  if (retur.type !== "penjualan") {
    throw new Error("Bukan retur penjualan.");
  }
  if (retur.status === "completed" || retur.status === "cancelled") {
    throw new Error("Retur sudah selesai atau dibatalkan.");
  }
  if (retur.workflow_phase === "awaiting_business" || retur.workflow_phase === "wms_received") {
    throw new Error("Retur sudah diterima WMS.");
  }
  if (retur.workflow_phase === "completed") {
    throw new Error("Retur sudah selesai.");
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

  const actualLines: {
    lineId: string;
    actualQty: number;
    actualCondition: "good" | "damaged";
  }[] = [];
  const stockLines: { product: string; qty: number }[] = [];

  for (const line of lines) {
    const recv = resolveReceivedLine(line, input.received_lines);
    const expectedQty = Number(line.qty) || 0;
    const actualQty = recv
      ? Math.min(expectedQty, Math.max(0, Number(recv.qty) || 0))
      : expectedQty;
    const expectedCondition =
      line.expected_condition === "damaged" || line.condition === "damaged" ? "damaged" : "good";
    const actualCondition: "good" | "damaged" =
      recv?.condition === "damaged"
        ? "damaged"
        : recv?.condition === "good"
          ? "good"
          : expectedCondition;

    if (actualQty > 0) {
      stockLines.push({ product: line.product, qty: actualQty });
    }
    actualLines.push({ lineId: line.id, actualQty, actualCondition });

    await pb.collection(BISNIS_COLLECTIONS.returLines).update(line.id, {
      actual_qty: actualQty,
      actual_condition: actualCondition,
      condition: actualCondition,
    });
  }

  if (!stockLines.length) throw new Error("Tidak ada qty diterima.");

  const analysis = analyzeSalesReturWmsReceive(lines, actualLines);

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
    noteSuffix: "Penerimaan WMS → gudang sementara",
  });

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
          status: "complete",
          completed_by: input.userId,
          wms_note: input.wms_note,
          unboxing_video_path: input.unboxing_video_path,
          wms_match: analysis.match,
        },
      });
    } catch {
      /* ignore */
    }
  }

  const wmsBasePatch: Partial<Retur> = {
    wms_receive_status: "complete",
    wms_received_at: new Date().toISOString(),
    warehouse: transit.id,
    unboxing_video_path: input.unboxing_video_path || retur.unboxing_video_path,
  };

  if (analysis.match) {
    await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(input.returId, {
      ...wmsBasePatch,
      workflow_phase: "awaiting_business",
      exception_status: "none",
      wms_exception_summary: "",
    });

    return autoFinalizeSalesReturAfterWms(pb, input.returId, input.userId);
  }

  const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(input.returId, {
    ...wmsBasePatch,
    workflow_phase: "awaiting_business",
    exception_status: exceptionStatusForMatch(false),
    reminder_due_at: reminderDueAtIso(),
    wms_exception_summary: JSON.stringify({
      exception_type: analysis.exceptionType,
      reasons: analysis.reasons,
      recorded_at: new Date().toISOString(),
    }),
  });

  const creatorId = retur.created_by;
  if (creatorId) {
    await notifyBusinessException(pb, {
      userId: creatorId,
      eventCode: "retur.sales.wms_exception",
      module: "sales",
      entityType: "biz_returs",
      entityId: retur.id,
      entityLabel: retur.retur_no,
      actionUrl: soId ? `/bisnis/penjualan/${soId}` : `/bisnis/retur/${retur.id}`,
      actorId: input.userId,
      warehouseId: transit.id,
      dedupeKey: `retur-wms-exc-${retur.id}`,
      exceptionType: analysis.exceptionType,
      reasons: analysis.reasons,
      payload: { retur_no: retur.retur_no },
    });
  }

  return updated;
}

/** @deprecated — gunakan receiveSalesReturnAtWms */
export async function completeSalesReturnWmsReceive(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<Retur> {
  return receiveSalesReturnAtWms(pb, { returId, userId });
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
