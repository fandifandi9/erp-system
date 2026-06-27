import type PocketBase from "pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

export type DamagedIntakeRef = {
  movementId: string;
  movementNo: string;
  referenceType: string;
  referenceNo: string;
  fromWarehouseId?: string;
  postedAt?: string;
  qty: number;
  label: string;
};

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

const REF_LABELS: Record<string, string> = {
  PURCHASE_QC_DAMAGED: "QC pembelian rusak",
  SALES_RETURN_DAMAGED: "Retur penjualan rusak",
  TRANSFER: "Transfer gudang",
  DAMAGED_REPAIR: "Koreksi servis",
  DAMAGED_REPAIR_RETAIL: "Servis → retail",
  DAMAGED_REASSIGN: "Koreksi entitas GR",
};

function refLabel(type: string, no: string): string {
  const base = REF_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
  return no ? `${base} · ${no}` : base;
}

/** Jejak masuk terakhir ke gudang rusak per produk (untuk sortir entitas). */
export async function loadDamagedIntakeRefs(
  pb: PocketBase,
  damagedWarehouseIds: string[],
  productIds: string[],
): Promise<Record<string, DamagedIntakeRef[]>> {
  const result: Record<string, DamagedIntakeRef[]> = {};
  const uniqueProducts = [...new Set(productIds.filter(Boolean))];
  if (damagedWarehouseIds.length === 0 || uniqueProducts.length === 0) return result;

  for (const pid of uniqueProducts) {
    for (const whId of damagedWarehouseIds) {
      result[`${whId}:${pid}`] = [];
    }
  }

  const whFilter = damagedWarehouseIds.map((id) => `to_warehouse = "${escId(id)}"`).join(" || ");
  const movements = await pb.collection(INV_COLLECTIONS.movements).getFullList<{
    id: string;
    movement_no?: string;
    reference_type?: string;
    reference_no?: string;
    from_warehouse?: string;
    to_warehouse?: string;
    posted_at?: string;
    created?: string;
    status?: string;
  }>({
    filter: `status = "posted" && (${whFilter})`,
    sort: "-posted_at,-created",
    fields: "id,movement_no,reference_type,reference_no,from_warehouse,to_warehouse,posted_at,created,status",
    requestKey: null,
  });

  if (movements.length === 0) return result;

  const movementIds = movements.map((m) => m.id);
  const movFilter = movementIds.map((id) => `movement = "${escId(id)}"`).join(" || ");
  const prodFilter = uniqueProducts.map((id) => `product = "${escId(id)}"`).join(" || ");

  const lines = await pb.collection(INV_COLLECTIONS.movementLines).getFullList<{
    movement: string;
    product: string;
    qty?: number;
  }>({
    filter: `(${movFilter}) && (${prodFilter})`,
    fields: "movement,product,qty",
    requestKey: null,
  });

  const linesByMovement = new Map<string, typeof lines>();
  for (const line of lines) {
    const mid = String(line.movement);
    const list = linesByMovement.get(mid) ?? [];
    list.push(line);
    linesByMovement.set(mid, list);
  }

  for (const mov of movements) {
    const whId = String(mov.to_warehouse ?? "");
    if (!damagedWarehouseIds.includes(whId)) continue;

    const movLines = linesByMovement.get(mov.id) ?? [];
    for (const line of movLines) {
      const pid = String(line.product);
      const key = `${whId}:${pid}`;
      if (!result[key]) continue;

      const ref: DamagedIntakeRef = {
        movementId: mov.id,
        movementNo: mov.movement_no ?? mov.id,
        referenceType: mov.reference_type ?? "TRANSFER",
        referenceNo: mov.reference_no ?? mov.movement_no ?? "",
        fromWarehouseId: mov.from_warehouse,
        postedAt: mov.posted_at ?? mov.created,
        qty: Number(line.qty) || 0,
        label: refLabel(mov.reference_type ?? "TRANSFER", mov.reference_no ?? mov.movement_no ?? ""),
      };

      const list = result[key];
      if (list.length < 3) list.push(ref);
    }
  }

  return result;
}
