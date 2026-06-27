import { pb } from "@/lib/pocketbase";
import { cancelWmsTasksForEntity } from "@/lib/wms/fulfillment";
import { updateProductBuyPrice } from "@/lib/inventory/client";
import {
  applyPurchaseStockOnly,
  createPurchaseBill,
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  updatePurchaseOrder,
} from "./client";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";
import {
  billBlockedReason,
  canCreateBillFromPurchaseOrder,
} from "./purchase-warehouse";
import {
  applyReceivingDisposition,
  resolvePurchaseStockWarehouse,
} from "./receiving-disposition";
import { BISNIS_COLLECTIONS, type PurchaseBill, type PurchaseOrder } from "./types";

export async function fetchPurchaseBillByPurchaseOrder(
  poId: string,
): Promise<PurchaseBill | null> {
  const list = await pb.collection(BISNIS_COLLECTIONS.purchaseBills).getFullList<PurchaseBill>({
    filter: `purchase_order = "${poId}"`,
    sort: "-created",
    requestKey: null,
  });
  return list[0] ?? null;
}

/** Buat tagihan (BILL) dari PO yang sudah ada, lalu posting stok. */
export async function createBillFromPurchaseOrder(
  poId: string,
  userId: string,
  opts?: { billNo?: string; skipStockPosting?: boolean },
): Promise<PurchaseBill> {
  const existing = await fetchPurchaseBillByPurchaseOrder(poId);
  if (existing) {
    throw new Error(`PO ini sudah punya tagihan: ${existing.bill_no}`);
  }

  const po = await fetchPurchaseOrder(poId);
  if (po.status === "cancelled") {
    throw new Error("PO dibatalkan tidak bisa dibuat tagihan");
  }

  const blocked = billBlockedReason(po);
  if (!canCreateBillFromPurchaseOrder(po)) {
    throw new Error(blocked ?? "PO belum siap untuk tagihan.");
  }

  const lines = await fetchPurchaseOrderLines(poId);
  if (lines.length === 0) {
    throw new Error("PO tidak punya item produk");
  }

  const billNo =
    opts?.billNo?.trim() ||
    (await nextDocNo(BIZ_DOC_NUMBER_CONFIG.bill, {
      periodDate: po.order_date,
    }));

  const bill = await createPurchaseBill({
    bill_no: billNo,
    purchase_order: po.id,
    supplier: po.supplier,
    bill_date: po.order_date,
    due_date: po.expected_date || po.order_date,
    status: "unpaid",
    subtotal: po.subtotal,
    discount_amount: po.discount_amount ?? 0,
    tax_amount: po.tax_amount,
    materai_amount: po.materai_amount ?? 0,
    total: po.total,
    paid_amount: 0,
    remaining: po.total,
    notes: po.notes,
    created_by: userId,
  });

  if (po.warehouse && !opts?.skipStockPosting) {
    const stockWarehouse = await resolvePurchaseStockWarehouse(po);
    await applyPurchaseStockOnly(po.id, {
      warehouse: stockWarehouse,
      reference_no: po.po_no,
      lines: lines.map((l) => ({ product: l.product, qty: l.qty })),
    });
    if (po.send_to_warehouse_at) {
      await applyReceivingDisposition(po, lines, userId);
    }
  }

  await Promise.all(
    lines.map((l) => updateProductBuyPrice(l.product, l.unit_cost).catch(() => {})),
  );

  if (!opts?.skipStockPosting) {
    await updatePurchaseOrder(po.id, { status: "received" });
  }

  return bill;
}

/** Batalkan PO yang belum punya tagihan aktif (PO tidak jadi pembelian). */
export async function cancelPurchaseOrderWithoutBill(
  poId: string,
  cancelReason?: string,
): Promise<PurchaseOrder> {
  const existing = await fetchPurchaseBillByPurchaseOrder(poId);
  if (existing && existing.status !== "cancelled") {
    throw new Error(
      `PO sudah punya tagihan ${existing.bill_no}. Batalkan lewat halaman tagihan.`,
    );
  }

  const po = await fetchPurchaseOrder(poId);
  if (po.status === "cancelled") {
    throw new Error("PO sudah dibatalkan.");
  }

  if (
    po.send_to_warehouse_at &&
    po.warehouse_process_status &&
    po.warehouse_process_status !== "complete"
  ) {
    throw new Error(
      "PO masih diproses gudang — selesaikan atau batalkan penerimaan di WMS dulu.",
    );
  }

  const { voidStockMovementsByReference } = await import("./client");
  await voidStockMovementsByReference(
    {
      referenceId: poId,
      referenceType: "PURCHASE_ORDER",
      referenceNo: po.po_no,
    },
    cancelReason?.trim() ? `Batal PO: ${cancelReason.trim()}` : `Batal PO ${po.po_no}`,
  );
  await cancelWmsTasksForEntity("biz_purchase_orders", poId);

  return updatePurchaseOrder(poId, { status: "cancelled" });
}

export { canEditPurchaseOrderDoc as canEditPurchaseOrder } from "./order-doc-status";
