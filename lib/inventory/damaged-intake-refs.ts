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
  const whSet = new Set(damagedWarehouseIds);
  if (damagedWarehouseIds.length === 0 || uniqueProducts.length === 0) return result;

  for (const pid of uniqueProducts) {
    for (const whId of damagedWarehouseIds) {
      result[`${whId}:${pid}`] = [];
    }
  }

  const prodFilter = uniqueProducts.map((id) => `product = "${escId(id)}"`).join(" || ");
  const lineRes = await pb.collection(INV_COLLECTIONS.movementLines).getList(1, 400, {
    filter: `(${prodFilter})`,
    expand: "movement",
    sort: "-created",
    fields: "movement,product,qty",
    requestKey: null,
  });

  type MovExpand = {
    id: string;
    movement_no?: string;
    reference_type?: string;
    reference_no?: string;
    from_warehouse?: string;
    to_warehouse?: string;
    posted_at?: string;
    created?: string;
    status?: string;
  };

  for (const line of lineRes.items) {
    const mov = line.expand?.movement as MovExpand | undefined;
    if (!mov || mov.status !== "posted") continue;
    const whId = String(mov.to_warehouse ?? "");
    if (!whSet.has(whId)) continue;

    const pid = String(line.product);
    const key = `${whId}:${pid}`;
    const list = result[key];
    if (!list || list.length >= 3) continue;

    list.push({
      movementId: mov.id,
      movementNo: mov.movement_no ?? mov.id,
      referenceType: mov.reference_type ?? "TRANSFER",
      referenceNo: mov.reference_no ?? mov.movement_no ?? "",
      fromWarehouseId: mov.from_warehouse,
      postedAt: mov.posted_at ?? mov.created,
      qty: Number(line.qty) || 0,
      label: refLabel(mov.reference_type ?? "TRANSFER", mov.reference_no ?? mov.movement_no ?? ""),
    });
  }

  return result;
}
