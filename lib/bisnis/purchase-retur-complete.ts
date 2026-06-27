import type PocketBase from "pocketbase";
import { postPurchaseReturnStockOutServer } from "@/lib/inventory/retur-stock-server";
import {
  applyPurchaseReturAccounting,
  revertPurchaseReturAccounting,
  type PurchaseRefundApplyResult,
} from "@/lib/bisnis/purchase-retur-accounting";
import {
  assertPurchaseReturEligible,
  isPurchaseOrderFullyReturnedAfter,
  sumReturnedQtyForPoLine,
} from "@/lib/bisnis/purchase-retur-guards";
import { returAwaitingBusiness } from "@/lib/bisnis/retur-workflow";
import {
  BISNIS_COLLECTIONS,
  type PurchaseOrder,
  type Retur,
  type ReturLine,
} from "@/lib/bisnis/types";
import { getWarehouseStockQty } from "@/lib/bisnis/warehouse-stock";
import { fetchWarehouseStockMap } from "@/lib/bisnis/warehouse-stock";

type ReturLineRow = ReturLine & { condition?: "good" | "damaged" };

function roundMoney(n: number) {
  return Math.round(n);
}

export type CompletePurchaseReturResult = {
  retur: Retur;
  refund_total: number;
};

export async function completePurchaseRetur(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<CompletePurchaseReturResult> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "pembelian") {
    throw new Error("Bukan retur pembelian.");
  }
  if (retur.status === "completed") throw new Error("Retur sudah diselesaikan.");
  if (retur.status === "cancelled") throw new Error("Retur dibatalkan.");
  if (!returAwaitingBusiness(retur.workflow_phase)) {
    throw new Error("Retur belum siap — tunggu persiapan WMS terlebih dahulu.");
  }

  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLineRow>({
    filter: `retur = "${returId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
  if (!lines.length) throw new Error("Tambahkan barang retur.");

  const poId = retur.purchase_order || retur.reference_id;
  if (!poId) throw new Error("Retur harus terhubung ke purchase order.");

  const po = await pb.collection(BISNIS_COLLECTIONS.purchaseOrders).getOne<PurchaseOrder>(poId);
  const warehouse = po.warehouse || retur.warehouse;
  if (!warehouse) throw new Error("Gudang utama entitas tidak ditemukan.");

  await assertPurchaseReturEligible(pb, poId, po.po_no, {
    excludeReturId: returId,
    skipOpenReturCheck: true,
  });

  const stockMap = await fetchWarehouseStockMap(warehouse);
  const stockLines: { product: string; qty: number }[] = [];
  let refundTotal = 0;

  for (const line of lines) {
    const qty = Number(line.qty) || 0;
    if (qty <= 0) continue;
    if (line.purchase_order_line) {
      const poLine = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getOne(line.purchase_order_line);
      const already = await sumReturnedQtyForPoLine(pb, line.purchase_order_line, returId);
      const maxQty = Number(poLine.qty) || 0;
      if (already + qty > maxQty) {
        throw new Error(
          `Qty retur melebihi pembelian untuk ${line.expand?.product?.name ?? line.product} (max ${maxQty - already}).`,
        );
      }
    }
    const available = getWarehouseStockQty(stockMap, line.product);
    if (available < qty) {
      const name = line.expand?.product?.name ?? line.product;
      throw new Error(
        `Stok di gudang utama tidak cukup untuk "${name}" (tersedia ${available}, butuh ${qty}). Pindahkan dari gudang penjualan ke gudang utama dulu.`,
      );
    }
    const unitPrice = Number(line.unit_price) || 0;
    refundTotal += Number(line.line_total) || roundMoney(unitPrice * qty);
    const existing = stockLines.find((b) => b.product === line.product);
    if (existing) existing.qty += qty;
    else stockLines.push({ product: line.product, qty });
  }

  if (!stockLines.length) throw new Error("Tidak ada qty retur valid.");

  const totalReturnQty = stockLines.reduce((s, l) => s + l.qty, 0);
  const isFullReturn = await isPurchaseOrderFullyReturnedAfter(pb, poId, totalReturnQty, returId);

  let accountingSnapshot: PurchaseRefundApplyResult = {};
  const postedMovementIds: string[] = [];

  try {
    if (refundTotal > 0) {
      accountingSnapshot = await applyPurchaseReturAccounting(pb, {
        poId,
        billId: retur.purchase_bill,
        refundTotal,
        returNo: retur.retur_no,
        isFullReturn,
      });
    }

    const posted = await postPurchaseReturnStockOutServer({
      pb,
      from_warehouse: warehouse,
      to_warehouse: warehouse,
      reference_type: "PURCHASE_RETURN",
      reference_id: returId,
      reference_no: retur.retur_no,
      lines: stockLines,
      userId,
    });
    postedMovementIds.push(posted.movement_id);

    const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
      status: "completed",
      workflow_phase: "completed",
      total: refundTotal,
      completed_at: new Date().toISOString(),
      warehouse,
    });

    return { retur: updated, refund_total: refundTotal };
  } catch (err) {
    for (const movementId of [...postedMovementIds].reverse()) {
      try {
        const { voidStockMovement } = await import("@/lib/inventory/stock-engine");
        await voidStockMovement(pb, movementId, userId, `Rollback retur ${retur.retur_no}`);
      } catch {
        /* best effort */
      }
    }
    if (accountingSnapshot.purchaseOrder || accountingSnapshot.bill) {
      try {
        await revertPurchaseReturAccounting(pb, accountingSnapshot);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}
