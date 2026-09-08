import type PocketBase from "pocketbase";
import { persistLocation } from "@/lib/inventory/location-save";
import { stripProductFromLocationName } from "@/lib/inventory/slot-product";
import {
  explainNotWarehouseRoom,
  isAssignableStorageLocation,
  type RoomLoc,
} from "@/lib/inventory/warehouse-rooms";
import { setProductWarehousePlacement } from "@/lib/inventory/product-warehouse-placement";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type LegacyLocRow = {
  id: string;
  code: string;
  name?: string;
  assigned_product?: string;
};

async function clearLegacyOnRows(
  pb: PocketBase,
  warehouseId: string,
  rows: LegacyLocRow[],
) {
  for (const rec of rows) {
    const legacyField = (rec.assigned_product ?? "").trim();
    const legacyName = /\s*\[produk:[a-z0-9]+\]\s*$/i.test(rec.name ?? "");
    if (!legacyField && !legacyName) continue;
    await persistLocation(pb, {
      id: rec.id,
      warehouse: warehouseId,
      code: rec.code,
      name: stripProductFromLocationName(rec.name ?? rec.code),
      zone_type: "rack",
      assigned_product: "",
      preserveName: true,
    });
  }
}

/** Hapus penanda lama di ruangan lain (tanpa scan seluruh gudang). */
async function clearOtherLegacyRoomProductTags(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
  keepRoomId: string,
) {
  const esc = productId.replace(/"/g, '\\"');
  try {
    const rows = (await pb.collection(INV_COLLECTIONS.locations).getFullList({
      filter: `warehouse = "${warehouseId}" && is_active = true && assigned_product = "${esc}"`,
      fields: "id,code,name,assigned_product",
    })) as LegacyLocRow[];
    await clearLegacyOnRows(
      pb,
      warehouseId,
      rows.filter((r) => r.id !== keepRoomId),
    );
  } catch {
    /* assigned_product mungkin belum ada di schema PB */
  }
}

/** Hapus penanda produk tunggal lama (unassign / migrasi). */
export async function clearLegacyRoomProductTag(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
) {
  const esc = productId.replace(/"/g, '\\"');
  try {
    const rows = (await pb.collection(INV_COLLECTIONS.locations).getFullList({
      filter: `warehouse = "${warehouseId}" && is_active = true && assigned_product = "${esc}"`,
      fields: "id,code,name,assigned_product",
    })) as LegacyLocRow[];
    await clearLegacyOnRows(pb, warehouseId, rows);
  } catch {
    /* skip jika field tidak ada */
  }
}

/** Tetapkan produk ke ruangan (boleh banyak produk per ruangan). */
export async function assignProductToWarehouseRoom(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
  roomId: string,
) {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouseId, {
    fields: "code",
  });
  const whCode = String((wh as { code?: string }).code ?? "").trim();

  const room = await pb.collection(INV_COLLECTIONS.locations).getOne(roomId, {
    fields: "id,warehouse,code,name,zone_type,level,bin,aisle,is_active",
  });
  if (room.warehouse !== warehouseId || room.is_active === false) {
    throw new Error("Slot tidak valid untuk gudang ini.");
  }
  if (!isAssignableStorageLocation(room as unknown as RoomLoc, whCode)) {
    const why = explainNotWarehouseRoom(room as unknown as RoomLoc, whCode) ?? "format lokasi tidak didukung";
    throw new Error(`Slot tidak bisa dipakai untuk penempatan produk (${why}).`);
  }

  await setProductWarehousePlacement(pb, warehouseId, productId, roomId);

  await clearOtherLegacyRoomProductTags(pb, warehouseId, productId, roomId);
}

export async function unassignProductFromWarehouseRoom(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
) {
  await setProductWarehousePlacement(pb, warehouseId, productId, null);
  await clearLegacyRoomProductTag(pb, warehouseId, productId);
}
