import type { InvLocation } from "./types";
import { isAssignableStorageLocation } from "./warehouse-rooms";

export type ProductWarehousePlacement = {
  slotId: string;
  slot: InvLocation;
  source: "room_assignment" | "default_location";
};

export function resolveProductPlacementInWarehouse(
  productId: string,
  warehouseId: string,
  byProductId: Record<string, InvLocation>,
  defaultLocation?: InvLocation | null,
  warehouseCode?: string,
): ProductWarehousePlacement | null {
  const assigned = byProductId[productId];
  if (assigned) {
    return { slotId: assigned.id, slot: assigned, source: "room_assignment" };
  }
  if (
    defaultLocation?.id &&
    defaultLocation.warehouse === warehouseId &&
    isAssignableStorageLocation(defaultLocation, warehouseCode)
  ) {
    return { slotId: defaultLocation.id, slot: defaultLocation, source: "default_location" };
  }
  return null;
}

export function roomLabel(loc: Pick<InvLocation, "code" | "name">): string {
  const name = (loc.name ?? "").replace(/\s*\[produk:[^\]]+\]/i, "").trim();
  return name && name !== loc.code ? `${loc.code} — ${name}` : loc.code;
}

export async function saveProductSlotPlacement(
  warehouseId: string,
  productId: string,
  roomLocationId: string | null,
): Promise<void> {
  const res = await fetch("/api/inventory/locations/assign-product", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      warehouse: warehouseId,
      productId,
      roomId: roomLocationId,
    }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal simpan penempatan");
}

/** @deprecated Hanya kompatibilitas impor lama */
export function rackCodeFromSlot(loc: Pick<InvLocation, "code">): string {
  return loc.code;
}
