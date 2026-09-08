import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { postAutoStockMovementServer } from "@/lib/inventory/auto-stock-server";
import { analyzePurchaseQcWorkflow } from "@/lib/core/expected-actual";
import {
  exceptionStatusForMatch,
  notifyBusinessException,
} from "@/lib/core/transaction-exception";
import {
  applyReceivingDisposition,
  resolvePurchaseStockWarehouse,
} from "@/lib/bisnis/receiving-disposition";
import {
  createBillFromPurchaseOrder,
  fetchPurchaseBillByPurchaseOrder,
} from "@/lib/bisnis/purchase-from-po";
import { updatePurchaseOrder } from "@/lib/bisnis/client";
import { BISNIS_COLLECTIONS, type PurchaseOrder, type PurchaseOrderLine } from "@/lib/bisnis/types";
import { reminderDueAtIso } from "@/lib/bisnis/retur-workflow";

async function loadPoLinesServer(poId: string): Promise<PurchaseOrderLine[]> {
  const pb = await getInventoryAdminPb();
  return pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList<PurchaseOrderLine>({
    filter: `purchase_order = "${poId.replace(/"/g, '\\"')}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
}

async function autoFinalizePurchaseReceiving(
  po: PurchaseOrder,
  userId: string,
): Promise<{ po: PurchaseOrder; billId?: string }> {
  const lines = await loadPoLinesServer(po.id);
  await applyReceivingDisposition(po, lines, userId);

  let billId: string | undefined;
  const existing = await fetchPurchaseBillByPurchaseOrder(po.id);
  if (existing) {
    billId = existing.id;
  } else {
    const bill = await createBillFromPurchaseOrder(po.id, userId, { skipStockPosting: true });
    billId = bill.id;
  }

  const pb = await getInventoryAdminPb();
  const now = new Date().toISOString();
  const updated = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(
    po.id,
    {
      receiving_business_status: "resolved",
      receiving_discrepancy: false,
      exception_status: "none",
      receiving_auto_proceeded_at: now,
      status: "received",
    },
  );

  return { po: updated, billId };
}

/**
 * WMS selesai QC: stok masuk gudang sementara.
 * Expected == Actual → auto disposition + bill (tanpa notifikasi bisnis).
 * Exception → awaiting_business + notifikasi.
 */
export async function postWmsPurchaseReceivingToTransit(
  poId: string,
  userId: string,
): Promise<PurchaseOrder> {
  const pb = await getInventoryAdminPb();
  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
  if (!po.send_to_warehouse_at) {
    throw new Error("PO tidak lewat WMS.");
  }

  const lines = await loadPoLinesServer(poId);
  const poFresh = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
  const analysis = analyzePurchaseQcWorkflow(lines, poFresh.receiving_workflow_json);
  if (!analysis.stockLines.length) {
    throw new Error("Tidak ada qty untuk diposting ke gudang sementara.");
  }

  const transitId = await resolvePurchaseStockWarehouse(po, pb);
  await postAutoStockMovementServer({
    type: "PURCHASE",
    warehouse: transitId,
    reference_type: "PURCHASE_ORDER",
    reference_id: po.id,
    reference_no: po.po_no,
    lines: analysis.stockLines,
    userId,
  });

  if (analysis.match) {
    const { po: finalized } = await autoFinalizePurchaseReceiving(
      { ...po, warehouse_process_status: "complete" },
      userId,
    );
    return finalized;
  }

  const updated = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(
    poId,
    {
      receiving_business_status: "awaiting_business",
      receiving_discrepancy: true,
      exception_status: exceptionStatusForMatch(false),
      reminder_due_at: reminderDueAtIso(),
      qc_exception_summary: JSON.stringify({
        exception_type: analysis.exceptionType,
        reasons: analysis.reasons,
        recorded_at: new Date().toISOString(),
      }),
    },
  );

  if (po.created_by) {
    await notifyBusinessException(pb, {
      userId: po.created_by,
      eventCode: "purchase.receiving.qc_exception",
      module: "purchase",
      entityType: "biz_purchase_orders",
      entityId: po.id,
      entityLabel: po.po_no,
      actionUrl: `/bisnis/pembelian/${po.id}`,
      actorId: userId,
      warehouseId: transitId,
      dedupeKey: `po-qc-exc-${po.id}`,
      exceptionType: analysis.exceptionType,
      reasons: analysis.reasons,
      payload: { po_no: po.po_no },
    });
  }

  return updated;
}

/** Pembeli menyelesaikan penerimaan saat QC Exception: disposition + tagihan. */
export async function finalizePurchaseReceiving(
  poId: string,
  userId: string,
): Promise<{ po: PurchaseOrder; billId?: string }> {
  const pb = await getInventoryAdminPb();
  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
  if (po.receiving_business_status !== "awaiting_business") {
    throw new Error("PO tidak menunggu keputusan bisnis.");
  }
  if (po.warehouse_process_status !== "complete") {
    throw new Error("Proses WMS belum komplit.");
  }

  const existing = await fetchPurchaseBillByPurchaseOrder(poId);
  if (existing) {
    await updatePurchaseOrder(poId, {
      receiving_business_status: "resolved",
      exception_status: "resolved",
      status: "received",
    });
    return { po: { ...po, receiving_business_status: "resolved" }, billId: existing.id };
  }

  const lines = await loadPoLinesServer(poId);
  await applyReceivingDisposition(po, lines, userId);

  const bill = await createBillFromPurchaseOrder(poId, userId, { skipStockPosting: true });

  const updated = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).update<PurchaseOrder>(
    poId,
    {
      receiving_business_status: "resolved",
      exception_status: "resolved",
      status: "received",
    },
  );

  return { po: updated, billId: bill.id };
}
