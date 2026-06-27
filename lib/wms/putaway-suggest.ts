import { pb } from "@/lib/pocketbase";

import { INV_COLLECTIONS, type InvLocation, type InvProduct } from "@/lib/inventory/types";

import { labelZoneType } from "@/lib/inventory/labels";

import { formatWarehouseLabel } from "@/lib/inventory/display";

import { getLocationPlacement } from "@/lib/inventory/location-fields";

import { getAssignedProductId } from "@/lib/inventory/slot-product";

import { getProductPlacementLocationInWarehouse } from "@/lib/inventory/product-warehouse-placement";
import { isWarehouseRoom } from "@/lib/inventory/warehouse-rooms";



export type PutawayDestination = {

  locationId: string;

  warehouseId: string;

  warehouseLabel: string;

  locationCode: string;

  locationName: string;

  zoneTypeLabel: string;

  aisle: string;

  level: string;

  bin: string;

  summary: string;

  detailLines: string[];

  source: "default_location" | "stock_balance" | "first_rack";

};



export type ReceivingPutawayHint =

  | { status: "known"; destination: PutawayDestination }

  | { status: "new" };



type LocationRow = InvLocation & {

  aisle?: string;

  level?: string;

  bin?: string;

  expand?: { warehouse?: { id: string; code: string; name: string } };

};



function formatPutawaySummary(loc: LocationRow, warehouseLabel: string): PutawayDestination {

  const zoneTypeLabel = loc.zone_type ? labelZoneType(loc.zone_type) : "Slot";

  const placement = getLocationPlacement(loc);

  const locationCode = loc.code || "—";

  const locationName = loc.name || locationCode;



  const detailLines: string[] = [

    `Gudang: ${warehouseLabel}`,

    `Slot: ${locationCode}`,

  ];

  if (locationName !== locationCode) detailLines.push(`Nama: ${locationName}`);



  const parts = [warehouseLabel, locationCode];

  if (locationName !== locationCode) parts.push(locationName);



  return {

    locationId: loc.id,

    warehouseId: loc.warehouse,

    warehouseLabel,

    locationCode,

    locationName,

    zoneTypeLabel,

    aisle: placement.aisle,

    level: placement.level,

    bin: placement.bin,

    summary: parts.join(" → "),

    detailLines,

    source: "default_location",

  };

}



async function loadLocation(locationId: string): Promise<LocationRow | null> {

  try {

    return (await pb.collection(INV_COLLECTIONS.locations).getOne(locationId, {

      expand: "warehouse",

      requestKey: null,

    })) as unknown as LocationRow;

  } catch {

    return null;

  }

}



/** Penempatan yang sudah ada di master — tanpa fallback ruangan pertama. */

async function loadWarehouseCode(warehouseId: string): Promise<string> {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouseId, {
    fields: "code",
    requestKey: null,
  });
  return String((wh as { code?: string }).code ?? "").trim();
}

export async function resolveKnownPutawayInWarehouse(

  warehouseId: string,

  productId: string,

): Promise<PutawayDestination | null> {

  if (!warehouseId || !productId) return null;

  const whCode = await loadWarehouseCode(warehouseId);

  try {

    const assignedSlots = await pb.collection(INV_COLLECTIONS.locations).getFullList({

      filter: `warehouse = "${warehouseId}" && is_active = true`,

      sort: "code",

      expand: "warehouse,assigned_product",

      requestKey: null,

    });

    const hit = (assignedSlots as unknown as LocationRow[]).find((loc) => {

      return getAssignedProductId(loc) === productId && isWarehouseRoom(loc, whCode);

    });

    if (hit) {

      const wh = hit.expand?.warehouse;

      const whLabel = formatWarehouseLabel(wh ?? null, warehouseId);

      return { ...formatPutawaySummary(hit, whLabel), source: "default_location" };

    }

  } catch {

    /* lanjut */

  }



  const placed = await getProductPlacementLocationInWarehouse(pb, warehouseId, productId);
  if (placed) {
    const loc = (await loadLocation(placed.id)) ?? (placed as LocationRow);
    if (loc && loc.warehouse === warehouseId) {
      const wh = loc.expand?.warehouse;
      const whLabel = formatWarehouseLabel(wh ?? null, warehouseId);
      return { ...formatPutawaySummary(loc, whLabel), source: "default_location" };
    }
  }



  try {

    const balances = await pb.collection(INV_COLLECTIONS.balances).getList(1, 5, {

      filter: `warehouse = "${warehouseId}" && product = "${productId}" && location != ""`,

      sort: "-qty_on_hand",

      expand: "location,location.warehouse,warehouse",

      requestKey: null,

    });

    const hit = balances.items.find((b) => {

      const loc = (b as { expand?: { location?: LocationRow } }).expand?.location;

      return loc && loc.warehouse === warehouseId && isWarehouseRoom(loc, whCode);

    });

    if (hit) {

      const loc = (hit as { expand?: { location?: LocationRow } }).expand?.location!;

      const wh = loc.expand?.warehouse;

      const whLabel = formatWarehouseLabel(wh ?? null, warehouseId);

      return { ...formatPutawaySummary(loc, whLabel), source: "stock_balance" };

    }

  } catch {

    return null;

  }



  return null;

}



/** Penerimaan: lokasi master jika ada, otherwise NEW (belum ditentukan). */

export async function resolveReceivingPutaway(

  warehouseId: string,

  productId: string,

): Promise<ReceivingPutawayHint> {

  const destination = await resolveKnownPutawayInWarehouse(warehouseId, productId);

  if (destination) return { status: "known", destination };

  return { status: "new" };

}



/** Saran umum (termasuk ruangan pertama jika belum ada master). */

export async function suggestPutawayForProduct(

  warehouseId: string,

  productId: string,

): Promise<PutawayDestination | null> {

  const known = await resolveKnownPutawayInWarehouse(warehouseId, productId);

  if (known) return known;

  const whCode = await loadWarehouseCode(warehouseId);

  try {

    const all = await pb.collection(INV_COLLECTIONS.locations).getFullList({

      filter: `warehouse = "${warehouseId}" && is_active = true`,

      sort: "code",

      expand: "warehouse",

      requestKey: null,

    });

    const loc = (all as unknown as LocationRow[]).find((l) => isWarehouseRoom(l, whCode));

    if (loc) {

      const whLabel = formatWarehouseLabel(loc.expand?.warehouse ?? null, warehouseId);

      return { ...formatPutawaySummary(loc, whLabel), source: "first_rack" };

    }

  } catch {

    return null;

  }



  return null;

}


