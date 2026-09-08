import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import type { InvLocation, InvProduct } from "./types";
import { INV_COLLECTIONS } from "./types";

export type InvProductPlacementRow = {
  id: string;
  product: string;
  warehouse: string;
  location: string;
  is_active?: boolean;
  expand?: {
    product?: Pick<InvProduct, "id" | "sku" | "name">;
    location?: InvLocation;
  };
};

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

let placementsCollectionAvailable: boolean | null = null;

/** Apakah collection inv_product_placements sudah ada di PocketBase. */
export async function isPlacementsCollectionAvailable(pb: PocketBase): Promise<boolean> {
  if (placementsCollectionAvailable !== null) return placementsCollectionAvailable;
  try {
    await pb.collection(INV_COLLECTIONS.productPlacements).getList(1, 1, { requestKey: null });
    placementsCollectionAvailable = true;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) {
      placementsCollectionAvailable = false;
    } else {
      placementsCollectionAvailable = false;
    }
  }
  return placementsCollectionAvailable;
}

export function placementsSchemaHint(): string {
  return (
    "Jalankan di terminal: npm run pb:placements-schema — " +
    "untuk penempatan produk per gudang (multi-gudang)."
  );
}

/** Simpan / hapus ruangan produk di satu gudang (tidak mengubah gudang lain). */
export async function setProductWarehousePlacement(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
  locationId: string | null,
): Promise<void> {
  const available = await isPlacementsCollectionAvailable(pb);
  if (!available) {
    throw new Error(placementsSchemaHint());
  }

  const baseFilter = `warehouse = "${escId(warehouseId)}" && product = "${escId(productId)}"`;

  let existing: InvProductPlacementRow | null = null;
  try {
    existing = (await pb
      .collection(INV_COLLECTIONS.productPlacements)
      .getFirstListItem(baseFilter)) as unknown as InvProductPlacementRow;
  } catch (err) {
    if (!(err instanceof ClientResponseError && err.status === 404)) throw err;
  }

  if (!locationId) {
    if (existing?.id) {
      await pb.collection(INV_COLLECTIONS.productPlacements).delete(existing.id);
    }
    return;
  }

  const loc = await pb.collection(INV_COLLECTIONS.locations).getOne(locationId, {
    fields: "id,warehouse,is_active",
  });
  if (loc.warehouse !== warehouseId || loc.is_active === false) {
    throw new Error("Slot harus aktif dan berada di gudang yang dipilih.");
  }

  if (existing?.id) {
    await pb.collection(INV_COLLECTIONS.productPlacements).update(existing.id, {
      location: locationId,
      is_active: true,
    });
    return;
  }

  await pb.collection(INV_COLLECTIONS.productPlacements).create({
    product: productId,
    warehouse: warehouseId,
    location: locationId,
    is_active: true,
  });
}

/** Peta productId → lokasi ruangan untuk satu gudang. */
export async function loadWarehouseProductPlacements(
  pb: PocketBase,
  warehouseId: string,
  roomById: Record<string, InvLocation>,
  productIds?: string[],
): Promise<Record<string, InvLocation>> {
  const byProductId: Record<string, InvLocation> = {};
  const available = await isPlacementsCollectionAvailable(pb);

  if (available) {
    try {
      let filter = `warehouse = "${escId(warehouseId)}" && is_active != false`;
      if (productIds && productIds.length > 0) {
        const chunkSize = 40;
        for (let i = 0; i < productIds.length; i += chunkSize) {
          const chunk = productIds.slice(i, i + chunkSize);
          const pf = chunk.map((id) => `product = "${escId(id)}"`).join(" || ");
          const rows = (await pb.collection(INV_COLLECTIONS.productPlacements).getFullList({
            filter: `${filter} && (${pf})`,
            fields: "id,product,location,is_active",
            expand: "location,product",
          })) as unknown as InvProductPlacementRow[];

          for (const row of rows) {
            const loc = row.expand?.location;
            const pid = row.product;
            if (!pid || !loc?.id || loc.warehouse !== warehouseId || loc.is_active === false) {
              continue;
            }
            byProductId[pid] = roomById[loc.id] ?? loc;
          }
        }
        return byProductId;
      }

      const rows = (await pb.collection(INV_COLLECTIONS.productPlacements).getFullList({
        filter,
        fields: "id,product,location,is_active",
        expand: "location,product",
      })) as unknown as InvProductPlacementRow[];

      for (const row of rows) {
        const loc = row.expand?.location;
        const pid = row.product;
        if (!pid || !loc?.id || loc.warehouse !== warehouseId || loc.is_active === false) {
          continue;
        }
        byProductId[pid] = roomById[loc.id] ?? loc;
      }
      return byProductId;
    } catch {
      /* lanjut ke legacy */
    }
  }

  return byProductId;
}

/** Legacy: default_location global (satu gudang saja). */
export async function mergeLegacyDefaultLocations(
  pb: PocketBase,
  warehouseId: string,
  roomById: Record<string, InvLocation>,
  byProductId: Record<string, InvLocation>,
  productIds?: string[],
): Promise<void> {
  const loadIds = productIds?.filter((id) => !byProductId[id]) ?? [];
  const needAll = !productIds?.length;

  let products: { id: string; sku: string; name: string; default_location?: string; expand?: { default_location?: InvLocation } }[] = [];

  if (needAll) {
    const filters = [
      'is_active = true && default_location != ""',
      "is_active = true && default_location != null",
    ];
    for (const filter of filters) {
      try {
        products = (await pb.collection(INV_COLLECTIONS.products).getFullList({
          filter,
          fields: "id,sku,name,default_location",
          expand: "default_location",
        })) as typeof products;
        break;
      } catch {
        continue;
      }
    }
  } else if (loadIds.length > 0) {
    const pf = loadIds.map((id) => `id = "${escId(id)}"`).join(" || ");
    try {
      products = (await pb.collection(INV_COLLECTIONS.products).getFullList({
        filter: pf,
        fields: "id,sku,name,default_location",
        expand: "default_location",
      })) as typeof products;
    } catch {
      return;
    }
  }

  for (const p of products) {
    if (byProductId[p.id]) continue;
    const loc = p.expand?.default_location;
    if (!loc?.id || loc.warehouse !== warehouseId || loc.is_active === false) continue;
    byProductId[p.id] = roomById[loc.id] ?? loc;
  }
}

/** Lokasi ruangan produk di satu gudang (placements dulu, lalu legacy default_location). */
export async function getProductPlacementLocationInWarehouse(
  pb: PocketBase,
  warehouseId: string,
  productId: string,
  roomById?: Record<string, InvLocation>,
): Promise<InvLocation | null> {
  const map = await loadWarehouseProductPlacements(
    pb,
    warehouseId,
    roomById ?? {},
    [productId],
  );
  if (map[productId]) return map[productId];
  const merged = { ...map };
  await mergeLegacyDefaultLocations(pb, warehouseId, roomById ?? {}, merged, [productId]);
  return merged[productId] ?? null;
}
