import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import {
  assertSalesReturEligible,
  canCreateSalesRetur,
  sumReturnedQtyForSoLine,
} from "@/lib/bisnis/sales-retur-guards";
import {
  legacyAmountsFromSettlement,
  resolveExpectedWarehouseForRetur,
  serializeSettlementEstimate,
  type CreateSalesReturInput,
} from "@/lib/bisnis/sales-retur-expected";
import { ensureTransitWarehouse } from "@/lib/bisnis/entity-modules";
import { resolveSalesReturCompanyId } from "@/lib/bisnis/retur-company";
import { resolveProcessActorName } from "@/lib/bisnis/process-actor";
import {
  BISNIS_COLLECTIONS,
  type Retur,
  type ReturLine,
  type ReturLineCondition,
  type SalesOrder,
  type SalesOrderLine,
} from "@/lib/bisnis/types";
import { enqueueSalesReturnWmsTaskOnCreate } from "@/lib/wms/sales-return-receive";

export { canCreateSalesRetur } from "@/lib/bisnis/sales-retur-guards";
export type { CreateSalesReturInput, CreateSalesReturLineInput } from "@/lib/bisnis/sales-retur-expected";

export async function createSalesReturFromOrder(
  pb: PocketBase,
  salesOrderId: string,
  userId: string,
  opts?: CreateSalesReturInput,
): Promise<{ retur: Retur; lines: ReturLine[] }> {
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(salesOrderId);
  if (!canCreateSalesRetur(so)) {
    throw new Error(
      `Sales order status "${so.status}" belum bisa diretur. Minimal sudah dikonfirmasi / terkirim.`,
    );
  }

  const invoice = await assertSalesReturEligible(pb, salesOrderId, so.order_no);

  const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${salesOrderId}"`,
    sort: "created",
    requestKey: null,
  });
  if (!soLines.length) {
    throw new Error("Sales order tidak punya barang.");
  }

  const soLineById = new Map(soLines.map((l) => [l.id, l]));

  type PlannedLine = {
    sol: SalesOrderLine;
    qty: number;
    expected_condition: ReturLineCondition;
    reason: string;
  };
  const planned: PlannedLine[] = [];

  if (opts?.lines?.length) {
    for (const input of opts.lines) {
      const sol = soLineById.get(input.sales_order_line);
      if (!sol) {
        throw new Error(`Baris SO tidak ditemukan: ${input.sales_order_line}`);
      }
      const qty = Math.max(0, Number(input.qty) || 0);
      if (qty <= 0) continue;

      const already = await sumReturnedQtyForSoLine(pb, sol.id);
      const maxQty = (Number(sol.qty) || 0) - already;
      if (qty > maxQty) {
        throw new Error(
          `Qty retur melebihi sisa untuk ${sol.expand?.product?.name ?? sol.product} (max ${maxQty}).`,
        );
      }

      const expected_condition: ReturLineCondition =
        input.expected_condition === "damaged" ? "damaged" : "good";
      planned.push({
        sol,
        qty,
        expected_condition,
        reason: input.reason?.trim() || "",
      });
    }
  } else {
    for (const sol of soLines) {
      const already = await sumReturnedQtyForSoLine(pb, sol.id);
      const remaining = (Number(sol.qty) || 0) - already;
      if (remaining > 0) {
        planned.push({ sol, qty: remaining, expected_condition: "good", reason: "" });
      }
    }
  }

  if (!planned.length) {
    throw new Error("Tidak ada barang yang bisa diretur.");
  }

  const returNo = await nextDocNoFor("ret");
  const companyId = await resolveSalesReturCompanyId(
    pb,
    { company: so.company, warehouse: so.warehouse, sales_order: salesOrderId, reference_id: salesOrderId },
    salesOrderId,
  );
  const transit = companyId ? await ensureTransitWarehouse(companyId, pb) : null;

  const hasDamaged = planned.some((p) => p.expected_condition === "damaged");
  let damagedWarehouseId = "";
  if (hasDamaged) {
    if (!companyId) {
      throw new Error("Entitas penjualan tidak ditemukan — tidak bisa menentukan gudang rusak.");
    }
    damagedWarehouseId = await resolveExpectedWarehouseForRetur(pb, {
      companyId,
      salesWarehouseId: so.warehouse,
      condition: "damaged",
    });
  }

  const legacyAmounts = opts?.settlement_estimate
    ? legacyAmountsFromSettlement(opts.settlement_estimate)
    : {
        mp_claim_amount: Math.max(0, Number(opts?.mp_claim_amount) || 0),
        shipping_reimb_amount: Math.max(0, Number(opts?.shipping_reimb_amount) || 0),
      };

  const settlementJson =
    opts?.settlement_estimate && opts.settlement_estimate.items.length > 0
      ? serializeSettlementEstimate(opts.settlement_estimate)
      : undefined;

  const returnMethod = opts?.return_method === "courier" ? "courier" : opts?.return_method === "dropoff" ? "dropoff" : undefined;
  const returnCourier = opts?.return_courier?.trim() || "";
  const returnTrackingNo = opts?.return_tracking_no?.trim() || "";
  if (returnMethod === "courier") {
    if (!returnCourier) {
      throw new Error("Pilih ekspedisi untuk retur via pengiriman.");
    }
    if (!returnTrackingNo) {
      throw new Error("Isi nomor lacak / resi untuk retur via ekspedisi.");
    }
  }

  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).create<Retur>({
    retur_no: returNo,
    type: "penjualan",
    status: "draft",
    workflow_phase: "awaiting_wms",
    sales_order: salesOrderId,
    reference_id: salesOrderId,
    invoice: invoice.id,
    customer: so.customer,
    warehouse: transit?.id ?? so.warehouse,
    damaged_warehouse: hasDamaged ? damagedWarehouseId : undefined,
    reason: opts?.reason?.trim() || "",
    notes: opts?.notes?.trim() || "",
    notes_for_wms: opts?.notes_for_wms?.trim() || "",
    platform_retur_no: opts?.platform_retur_no?.trim() || "",
    business_process_started_at: new Date().toISOString(),
    business_processed_by: userId,
    business_processed_by_name: await resolveProcessActorName(pb, userId),
    ...(returnMethod ? { return_method: returnMethod } : {}),
    ...(returnCourier ? { return_courier: returnCourier } : {}),
    ...(returnTrackingNo ? { return_tracking_no: returnTrackingNo } : {}),
    settlement_estimate_json: settlementJson,
    mp_claim_amount: legacyAmounts.mp_claim_amount,
    shipping_reimb_amount: legacyAmounts.shipping_reimb_amount,
    total: 0,
    wms_receive_status: "pending",
    exception_status: "none",
    created_by: userId,
  });

  const lines: ReturLine[] = [];
  for (const { sol, qty, expected_condition, reason } of planned) {
    const unitPrice = sol.unit_price;
    const expectedWarehouse = companyId
      ? await resolveExpectedWarehouseForRetur(pb, {
          companyId,
          salesWarehouseId: so.warehouse,
          condition: expected_condition,
        })
      : expected_condition === "good"
        ? so.warehouse
        : damagedWarehouseId;

    const line = await pb.collection(BISNIS_COLLECTIONS.returLines).create<ReturLine>({
      retur: retur.id,
      product: sol.product,
      qty,
      unit_price: unitPrice,
      line_total: sol.line_total
        ? Math.round((sol.line_total / (Number(sol.qty) || 1)) * qty)
        : Math.round(unitPrice * qty),
      condition: expected_condition,
      expected_condition,
      expected_warehouse: expectedWarehouse,
      sales_order_line: sol.id,
      reason,
    });
    lines.push(line);
  }

  if (transit?.id) {
    await enqueueSalesReturnWmsTaskOnCreate(pb, {
      retur,
      lines,
      soOrderNo: so.order_no,
      userId,
      transitWarehouseId: transit.id,
    });
  }

  return { retur, lines };
}
