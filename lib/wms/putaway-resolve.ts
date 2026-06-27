import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { isWarehouseRoom, type RoomLoc } from "@/lib/inventory/warehouse-rooms";

/** ID lokasi ruangan — langsung dari pilihan atau cari by kode. */
async function warehouseCodeFor(warehouseId: string): Promise<string> {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouseId, {
    fields: "code",
    requestKey: null,
  });
  return String((wh as { code?: string }).code ?? "").trim();
}

export async function resolveRoomLocationId(
  warehouseId: string,
  roomIdOrCode: string,
): Promise<string | null> {
  if (!warehouseId || !roomIdOrCode?.trim()) return null;
  const whCode = await warehouseCodeFor(warehouseId);
  const key = roomIdOrCode.trim();
  if (key.length >= 15 && !key.includes("-")) {
    try {
      const loc = await pb.collection(INV_COLLECTIONS.locations).getOne(key, {
        fields: "id,warehouse,code,is_active",
        requestKey: null,
      });
      if (loc.warehouse === warehouseId && loc.is_active !== false && isWarehouseRoom(loc as unknown as RoomLoc, whCode)) {
        return loc.id;
      }
    } catch {
      /* fallback ke kode */
    }
  }
  try {
    const loc = await pb.collection(INV_COLLECTIONS.locations).getFirstListItem(
      `warehouse = "${warehouseId}" && code = "${key.replace(/"/g, '\\"')}" && is_active = true`,
      { requestKey: null },
    );
    return isWarehouseRoom(loc as unknown as RoomLoc, whCode) ? loc.id : null;
  } catch {
    return null;
  }
}

/** @deprecated Pakai resolveRoomLocationId */
export async function resolveSlotLocationId(
  warehouseId: string,
  rackCode: string,
  _level: string,
  _slot: string,
): Promise<string | null> {
  return resolveRoomLocationId(warehouseId, rackCode);
}
