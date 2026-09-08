import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import { ensureTransitWarehouse, getDamagedWarehouse } from "@/lib/bisnis/entity-modules";
import { resolveExpectedWarehouseForRetur } from "@/lib/bisnis/sales-retur-expected";
import {
  BISNIS_COLLECTIONS,
  type Retur,
  type ReturLine,
  type ReturLineCondition,
  type ReturType,
} from "@/lib/bisnis/types";
import { enqueueSalesReturnWmsTaskOnCreate } from "@/lib/wms/sales-return-receive";

export type StandaloneReturLineInput = {
  product: string;
  qty: number;
  unit_price?: number;
  expected_condition?: ReturLineCondition;
  reason?: string;
};

export type CreateStandaloneReturInput = {
  type: ReturType;
  warehouse: string;
  company?: string;
  customer?: string;
  supplier?: string;
  reason?: string;
  notes?: string;
  notes_for_wms?: string;
  return_method?: "dropoff" | "courier";
  return_courier?: string;
  return_tracking_no?: string;
  lines: StandaloneReturLineInput[];
};

export async function createStandaloneRetur(
  pb: PocketBase,
  userId: string,
  input: CreateStandaloneReturInput,
): Promise<{ retur: Retur; lines: ReturLine[] }> {
  if (input.type !== "penjualan" && input.type !== "pembelian") {
    throw new Error("Jenis retur tidak valid.");
  }
  if (!input.warehouse?.trim()) {
    throw new Error("Gudang wajib dipilih.");
  }
  if (input.type === "penjualan" && !input.customer?.trim()) {
    throw new Error("Pelanggan wajib untuk retur penjualan.");
  }
  if (input.type === "pembelian" && !input.supplier?.trim()) {
    throw new Error("Pemasok wajib untuk retur pembelian.");
  }

  const planned = input.lines
    .map((l) => ({
      product: l.product,
      qty: Math.max(0, Number(l.qty) || 0),
      unit_price: Math.max(0, Number(l.unit_price) || 0),
      expected_condition: (l.expected_condition === "damaged" ? "damaged" : "good") as ReturLineCondition,
      reason: l.reason?.trim() || "",
    }))
    .filter((l) => l.product && l.qty > 0);

  if (!planned.length) {
    throw new Error("Tambahkan minimal satu barang retur.");
  }

  const returnMethod =
    input.return_method === "courier" ? "courier" : input.return_method === "dropoff" ? "dropoff" : undefined;
  const returnCourier = input.return_courier?.trim() || "";
  const returnTrackingNo = input.return_tracking_no?.trim() || "";
  if (returnMethod === "courier") {
    if (!returnCourier) throw new Error("Pilih ekspedisi untuk retur via pengiriman.");
    if (!returnTrackingNo) throw new Error("Isi nomor lacak untuk retur via ekspedisi.");
  }

  const companyId = input.company?.trim() || "";
  const transit = companyId ? await ensureTransitWarehouse(companyId, pb) : null;
  const hasDamaged = planned.some((p) => p.expected_condition === "damaged");
  let damagedWarehouseId = "";
  if (hasDamaged && input.type === "penjualan") {
    if (companyId) {
      damagedWarehouseId = await resolveExpectedWarehouseForRetur(pb, {
        companyId,
        salesWarehouseId: input.warehouse,
        condition: "damaged",
      });
    } else {
      const damaged = await getDamagedWarehouse(companyId, pb);
      damagedWarehouseId = damaged?.id || "";
    }
  }

  const returNo = await nextDocNoFor("ret");
  const receiveWarehouse =
    input.type === "penjualan" ? (transit?.id ?? input.warehouse) : input.warehouse;

  const retur = await pb.collection(BISNIS_COLLECTIONS.returs).create<Retur>({
    retur_no: returNo,
    type: input.type,
    status: "draft",
    workflow_phase: "awaiting_wms",
    warehouse: receiveWarehouse,
    damaged_warehouse: hasDamaged && damagedWarehouseId ? damagedWarehouseId : undefined,
    customer: input.type === "penjualan" ? input.customer : undefined,
    supplier: input.type === "pembelian" ? input.supplier : undefined,
    reason: input.reason?.trim() || "",
    notes: input.notes?.trim() || "",
    notes_for_wms: input.notes_for_wms?.trim() || "",
    ...(returnMethod ? { return_method: returnMethod } : {}),
    ...(returnCourier ? { return_courier: returnCourier } : {}),
    ...(returnTrackingNo ? { return_tracking_no: returnTrackingNo } : {}),
    total: 0,
    wms_receive_status: input.type === "penjualan" ? "pending" : undefined,
    exception_status: "none",
    created_by: userId,
  });

  const lines: ReturLine[] = [];
  let total = 0;
  for (const row of planned) {
    const lineTotal = Math.round(row.unit_price * row.qty);
    total += lineTotal;
    const expectedWarehouse =
      input.type === "penjualan" && companyId
        ? await resolveExpectedWarehouseForRetur(pb, {
            companyId,
            salesWarehouseId: input.warehouse,
            condition: row.expected_condition,
          })
        : input.warehouse;

    const line = await pb.collection(BISNIS_COLLECTIONS.returLines).create<ReturLine>({
      retur: retur.id,
      product: row.product,
      qty: row.qty,
      unit_price: row.unit_price,
      line_total: lineTotal,
      condition: row.expected_condition,
      expected_condition: row.expected_condition,
      expected_warehouse: expectedWarehouse,
      reason: row.reason,
    });
    lines.push(line);
  }

  await pb.collection(BISNIS_COLLECTIONS.returs).update(retur.id, { total });

  if (input.type === "penjualan" && transit?.id) {
    await enqueueSalesReturnWmsTaskOnCreate(pb, {
      retur: { ...retur, total },
      lines,
      soOrderNo: retur.retur_no,
      userId,
      transitWarehouseId: transit.id,
    });
  }

  return { retur: { ...retur, total }, lines };
}
