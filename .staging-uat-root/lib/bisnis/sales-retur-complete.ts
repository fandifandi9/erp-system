import type PocketBase from "pocketbase";
import { postTransferStockMovementServer } from "@/lib/inventory/transfer-stock-server";
import { assertDamagedWarehouseForCompany } from "@/lib/inventory/damaged-company-guard";
import {
  applySalesReturAccounting,
  revertSalesReturAccounting,
  type RefundApplyResult,
} from "@/lib/bisnis/sales-retur-accounting";
import {
  legacyAmountsFromSettlement,
  parseSettlementEstimateJson,
} from "@/lib/bisnis/sales-retur-expected";
import {
  applySalesReturSettlementItems,
  hasPendingSettlementEstimate,
  settlementTotals,
} from "@/lib/bisnis/sales-retur-settlement";
import {
  assertSalesReturEligible,
  isSalesOrderFullyReturnedAfter,
  sumReturnedQtyForSoLine,
} from "@/lib/bisnis/sales-retur-guards";
import { resolveSalesReturCompanyId } from "@/lib/bisnis/retur-company";
import {
  getDamagedWarehouse,
  getTransitWarehouse,
} from "@/lib/bisnis/entity-modules";
import { returAwaitingBusiness, returAwaitingSettlement } from "@/lib/bisnis/retur-workflow";
import {
  BISNIS_COLLECTIONS,
  type Retur,
  type ReturLine,
  type SalesOrder,
} from "@/lib/bisnis/types";

type ReturLineRow = ReturLine & { condition?: "good" | "damaged" };

function roundMoney(n: number) {
  return Math.round(n);
}

export { sumReturnedQtyForSoLine } from "@/lib/bisnis/sales-retur-guards";

export type CompleteSalesReturResult = {
  retur: Retur;
  refund_total: number;
  good_lines: number;
  damaged_lines: number;
  awaiting_settlement?: boolean;
};

type StockBuckets = {
  goodLines: { product: string; qty: number }[];
  damagedLines: { product: string; qty: number }[];
  refundTotal: number;
  mainWarehouseId: string;
  damagedWarehouseId: string;
  transitWarehouseId: string;
};

async function buildStockBuckets(
  pb: PocketBase,
  retur: Retur,
  lines: ReturLineRow[],
  so: SalesOrder,
  returId: string,
): Promise<StockBuckets> {
  const goodLines: { product: string; qty: number }[] = [];
  const damagedLines: { product: string; qty: number }[] = [];
  let refundTotal = 0;

  for (const line of lines) {
    const qty = Number(line.actual_qty ?? line.qty) || 0;
    if (qty <= 0) continue;
    const condition =
      line.actual_condition === "damaged" || line.condition === "damaged" ? "damaged" : "good";
    if (line.sales_order_line) {
      const soLine = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getOne(line.sales_order_line);
      const already = await sumReturnedQtyForSoLine(pb, line.sales_order_line, returId);
      const maxQty = Number(soLine.qty) || 0;
      if (already + qty > maxQty) {
        throw new Error(
          `Qty retur melebihi penjualan untuk produk ${line.expand?.product?.name ?? line.product} (max ${maxQty - already}).`,
        );
      }
    }
    const unitPrice = Number(line.unit_price) || 0;
    const lineTotal = Number(line.line_total) || roundMoney(unitPrice * qty);
    refundTotal += lineTotal;

    const bucket = condition === "damaged" ? damagedLines : goodLines;
    const existing = bucket.find((b) => b.product === line.product);
    if (existing) existing.qty += qty;
    else bucket.push({ product: line.product, qty });
  }

  if (!goodLines.length && !damagedLines.length) {
    throw new Error("Tidak ada qty retur yang valid.");
  }

  const resolvedCompanyId = await resolveSalesReturCompanyId(pb, retur, so.id);
  const transitWarehouse = resolvedCompanyId ? await getTransitWarehouse(resolvedCompanyId, pb) : null;
  const mainWarehouseId = so.warehouse || retur.warehouse;
  const damagedWarehouseId =
    retur.damaged_warehouse ||
    (resolvedCompanyId ? (await getDamagedWarehouse(resolvedCompanyId, pb))?.id : "") ||
    "";

  if (!transitWarehouse?.id) {
    throw new Error("Gudang sementara tidak ditemukan untuk entitas ini.");
  }
  if (goodLines.length && !mainWarehouseId) {
    throw new Error("Gudang utama entitas tidak ditemukan.");
  }
  if (damagedLines.length && !damagedWarehouseId) {
    throw new Error("Gudang rusak belum dikonfigurasi untuk barang tidak layak dijual.");
  }
  if (damagedLines.length && damagedWarehouseId && resolvedCompanyId) {
    await assertDamagedWarehouseForCompany(pb, damagedWarehouseId, resolvedCompanyId);
  }

  return {
    goodLines,
    damagedLines,
    refundTotal,
    mainWarehouseId,
    damagedWarehouseId,
    transitWarehouseId: transitWarehouse.id,
  };
}

/** Posting stok: transit → gudang penjualan / rusak. Tidak menyentuh pembukuan settlement. */
export async function finalizeSalesReturStock(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<CompleteSalesReturResult> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "penjualan") throw new Error("Hanya retur penjualan.");
  if (retur.status === "completed") throw new Error("Retur sudah diselesaikan.");
  if (retur.status === "cancelled") throw new Error("Retur dibatalkan.");
  if (retur.stock_posted_at) throw new Error("Stok retur sudah diposting.");
  if (!returAwaitingBusiness(retur.workflow_phase) && retur.wms_receive_status !== "complete") {
    throw new Error("Retur belum diterima WMS.");
  }

  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLineRow>({
    filter: `retur = "${returId}"`,
    expand: "product",
    sort: "created",
    requestKey: null,
  });
  const soId = retur.sales_order || retur.reference_id;
  if (!soId) throw new Error("Retur harus terhubung ke sales order.");

  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);
  await assertSalesReturEligible(pb, soId, so.order_no, {
    excludeReturId: returId,
    skipOpenReturCheck: true,
  });

  const buckets = await buildStockBuckets(pb, retur, lines, so, returId);
  const { resolveReturnLinesFromSale } = await import("@/lib/catalog/sale-stock-lines");
  const expandedGood = await resolveReturnLinesFromSale(pb, buckets.goodLines);
  const expandedDamaged = await resolveReturnLinesFromSale(pb, buckets.damagedLines);

  if (expandedGood.length && buckets.mainWarehouseId) {
    await postTransferStockMovementServer({
      from_warehouse: buckets.transitWarehouseId,
      to_warehouse: buckets.mainWarehouseId,
      reference_type: "SALES_RETURN",
      reference_id: returId,
      reference_no: retur.retur_no,
      lines: expandedGood,
      userId,
      noteSuffix: "Retur: layak dijual → gudang penjualan",
    });
  }
  if (expandedDamaged.length && buckets.damagedWarehouseId) {
    await postTransferStockMovementServer({
      from_warehouse: buckets.transitWarehouseId,
      to_warehouse: buckets.damagedWarehouseId,
      reference_type: "SALES_RETURN_DAMAGED",
      reference_id: returId,
      reference_no: retur.retur_no,
      lines: expandedDamaged,
      userId,
      noteSuffix: "Retur: tidak layak → gudang rusak",
    });
  }

  const now = new Date().toISOString();
  const pendingSettlement = hasPendingSettlementEstimate(retur);
  const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
    stock_posted_at: now,
    total: buckets.refundTotal,
    warehouse: buckets.mainWarehouseId ?? retur.warehouse,
    damaged_warehouse: buckets.damagedWarehouseId || retur.damaged_warehouse,
    exception_status: retur.exception_status === "open" ? "resolved" : retur.exception_status ?? "none",
    workflow_phase: pendingSettlement ? "awaiting_settlement" : retur.workflow_phase,
    reminder_due_at: pendingSettlement ? retur.reminder_due_at : "",
  });

  if (pendingSettlement) {
    return {
      retur: updated,
      refund_total: buckets.refundTotal,
      good_lines: buckets.goodLines.length,
      damaged_lines: buckets.damagedLines.length,
      awaiting_settlement: true,
    };
  }

  return settleSalesReturFinance(pb, returId, userId, buckets.refundTotal);
}

/** Pembukuan + settlement estimate — tidak mengubah stok. */
export async function settleSalesReturFinance(
  pb: PocketBase,
  returId: string,
  userId: string,
  refundTotalOverride?: number,
): Promise<CompleteSalesReturResult> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.type !== "penjualan") throw new Error("Hanya retur penjualan.");
  if (retur.status === "completed") throw new Error("Retur sudah diselesaikan.");
  if (!retur.stock_posted_at) {
    throw new Error("Posting stok belum dilakukan. Selesaikan stok dulu.");
  }

  const soId = retur.sales_order || retur.reference_id;
  if (!soId) throw new Error("Retur harus terhubung ke sales order.");
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);

  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLineRow>({
    filter: `retur = "${returId}"`,
    requestKey: null,
  });

  let refundTotal = refundTotalOverride ?? (Number(retur.total) || 0);
  if (!refundTotal) {
    for (const line of lines) {
      const qty = Number(line.actual_qty ?? line.qty) || 0;
      const unitPrice = Number(line.unit_price) || 0;
      refundTotal += Number(line.line_total) || roundMoney(unitPrice * qty);
    }
  }

  const estimate = parseSettlementEstimateJson(retur.settlement_estimate_json);
  const totals = settlementTotals(estimate);
  const mpClaim = totals.mp_claim_amount || Math.max(0, Number(retur.mp_claim_amount) || 0);
  const shippingReimb =
    totals.shipping_reimb_amount || Math.max(0, Number(retur.shipping_reimb_amount) || 0);

  const totalReturnQty = lines.reduce(
    (s, l) => s + (Number(l.actual_qty ?? l.qty) || 0),
    0,
  );
  const isFullReturn = await isSalesOrderFullyReturnedAfter(pb, soId, totalReturnQty, returId);

  let accountingSnapshot: RefundApplyResult = { expenseIds: [], refundPaymentIds: [], creditNoteIds: [] };

  try {
    if (refundTotal > 0 || shippingReimb > 0 || mpClaim > 0) {
      accountingSnapshot = await applySalesReturAccounting(pb, {
        soId,
        invoiceId: retur.invoice,
        returId,
        refundTotal,
        mpClaim,
        shippingReimb,
        returNo: retur.retur_no,
        orderNo: so.order_no,
        isFullReturn,
        userId,
      });
    }

    const settlementResult = await applySalesReturSettlementItems(pb, {
      retur,
      soId,
      orderNo: so.order_no,
      userId,
      companyId: so.company,
      storeId: so.store,
      warehouseId: so.warehouse,
    });
    accountingSnapshot.expenseIds.push(...settlementResult.expenseIds);

    const updated = await pb.collection(BISNIS_COLLECTIONS.returs).update<Retur>(returId, {
      status: "completed",
      workflow_phase: "completed",
      total: refundTotal,
      completed_at: new Date().toISOString(),
      settled_at: new Date().toISOString(),
      mp_claim_amount: mpClaim,
      shipping_reimb_amount: shippingReimb,
      reminder_due_at: "",
    });

    return {
      retur: updated,
      refund_total: refundTotal,
      good_lines: 0,
      damaged_lines: 0,
    };
  } catch (err) {
    if (
      accountingSnapshot.salesOrder ||
      accountingSnapshot.invoice ||
      accountingSnapshot.expenseIds.length ||
      accountingSnapshot.refundPaymentIds.length ||
      accountingSnapshot.creditNoteIds.length
    ) {
      try {
        await revertSalesReturAccounting(pb, accountingSnapshot);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
}

/**
 * Selesaikan retur penjualan: stok dulu, lalu settlement (atau langsung keduanya jika tanpa estimasi settlement).
 */
export async function completeSalesRetur(
  pb: PocketBase,
  returId: string,
  userId: string,
): Promise<CompleteSalesReturResult> {
  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(returId);
  if (retur.workflow_phase === "awaiting_settlement" || returAwaitingSettlement(retur.workflow_phase)) {
    return settleSalesReturFinance(pb, returId, userId);
  }
  if (retur.stock_posted_at) {
    return settleSalesReturFinance(pb, returId, userId);
  }
  return finalizeSalesReturStock(pb, returId, userId);
}
