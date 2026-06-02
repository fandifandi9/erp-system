/**
 * Sinkron operasi WMS dengan transaksi Bisnis — tanpa stok terpisah.
 * Stok hanya berubah lewat inv_stock_movements (posted).
 */
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type TaskLine = { product: string; sku?: string; name?: string; qty: number };

async function logWmsTask(input: {
  userId: string;
  warehouseId: string;
  activityType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}) {
  try {
    await pb.collection(INV_COLLECTIONS.staffActivities).create({
      user: input.userId,
      warehouse: input.warehouseId,
      activity_type: input.activityType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      payload: input.payload,
      occurred_at: new Date().toISOString(),
      device_platform: "web",
    });
  } catch {
    /* audit opsional */
  }
}

/** Setelah penjualan posting OUT — antrean picking & packing di WMS. */
export async function enqueueOutboundFromSalesOrder(soId: string, userId: string) {
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne(soId);
  const lines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList({
    filter: `sales_order = "${soId}"`,
    requestKey: null,
  });

  const taskLines: TaskLine[] = lines.map((l) => {
    const row = l as {
      product: string;
      qty: number;
      sku_snapshot?: string;
      name_snapshot?: string;
    };
    return {
      product: row.product,
      qty: Number(row.qty) || 0,
      sku: row.sku_snapshot,
      name: row.name_snapshot,
    };
  });

  const wh = String(so.warehouse || "");
  const orderNo = String(so.order_no || soId);
  const base = { order_no: orderNo, lines: taskLines, status: "pending" };

  await logWmsTask({
    userId,
    warehouseId: wh,
    activityType: "wms.pick_task",
    entityType: "biz_sales_orders",
    entityId: soId,
    payload: { ...base, kind: "picking" },
  });

  await logWmsTask({
    userId,
    warehouseId: wh,
    activityType: "wms.pack_task",
    entityType: "biz_sales_orders",
    entityId: soId,
    payload: { ...base, kind: "packing" },
  });

  try {
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
      status: "processing",
    });
  } catch {
    /* status field opsional di PB */
  }
}

/** Setelah pembelian posting IN — antrean penerimaan / QC di WMS. */
export async function enqueueInboundFromPurchaseOrder(poId: string, userId: string) {
  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne(poId);
  const lines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList({
    filter: `purchase_order = "${poId}"`,
    requestKey: null,
  });

  const taskLines: TaskLine[] = lines.map((l) => {
    const row = l as { product: string; qty: number };
    return { product: row.product, qty: Number(row.qty) || 0 };
  });

  await logWmsTask({
    userId,
    warehouseId: String(po.warehouse || ""),
    activityType: "wms.receive_task",
    entityType: "biz_purchase_orders",
    entityId: poId,
    payload: {
      po_no: String(po.po_no || poId),
      lines: taskLines,
      status: "pending",
      note: "Stok pusat sudah bertambah (IN). Lanjut penerimaan fisik / QC.",
    },
  });
}

export async function cancelWmsTasksForEntity(entityType: string, entityId: string) {
  const list = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
    filter: `entity_type = "${entityType}" && entity_id = "${entityId}"`,
    requestKey: null,
  });
  for (const row of list) {
    const r = row as { id: string; payload?: { status?: string } };
    if (r.payload?.status === "cancelled") continue;
    try {
      await pb.collection(INV_COLLECTIONS.staffActivities).update(r.id, {
        payload: { ...(r.payload || {}), status: "cancelled" },
      });
    } catch {
      /* ignore */
    }
  }
}
