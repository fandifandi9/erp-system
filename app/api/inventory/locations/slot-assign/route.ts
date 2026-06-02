import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { persistLocation } from "@/lib/inventory/location-save";
import { buildRackSlotName, sanitizeRackSegment } from "@/lib/inventory/rack-builder";
import { buildSlotCodeForRack, parseSlotFromLocationCode } from "@/lib/inventory/rack-layout";
import { getSlotDisplayName } from "@/lib/inventory/slot-product";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { ClientResponseError } from "pocketbase";

type AssignBody = {
  warehouse: string;
  rackCode: string;
  level: string;
  slot: string;
  aisle?: string;
  rack?: string;
  productId?: string;
};

async function clearProductDefaultForSlot(
  pb: Awaited<ReturnType<typeof getLocationPb>>,
  locationId: string,
) {
  try {
    const list = await pb.collection(INV_COLLECTIONS.products).getList(1, 20, {
      filter: `default_location = "${locationId}"`,
      fields: "id,sku,name",
    });
    for (const row of list.items) {
      const p = row as { id: string; sku: string; name: string };
      await pb.collection(INV_COLLECTIONS.products).update(p.id, {
        sku: p.sku,
        name: p.name,
        default_location: "",
      });
    }
  } catch {
    /* ignore */
  }
}

async function syncProductDefaultForSlot(
  pb: Awaited<ReturnType<typeof getLocationPb>>,
  productId: string,
  locationId: string,
) {
  if (!productId) {
    return;
  }
  const product = await pb.collection(INV_COLLECTIONS.products).getOne(productId, {
    fields: "id,sku,name,default_location",
  });
  await pb.collection(INV_COLLECTIONS.products).update(productId, {
    sku: product.sku,
    name: product.name,
    default_location: locationId || "",
  });
}

async function getLocationPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin.", 403);
    }

    const body = (await req.json()) as AssignBody;
    if (!body.warehouse?.trim() || !body.rackCode?.trim() || !body.level?.trim() || !body.slot?.trim()) {
      throw new InventoryApiError("warehouse, rackCode, level, dan slot wajib.", 400);
    }

    const rackCode = body.rackCode.trim().toUpperCase();
    const level = body.level.trim();
    const slot = body.slot.trim();
    const slotCode = buildSlotCodeForRack(rackCode, level, slot);
    const parsed = parseSlotFromLocationCode(rackCode);
    const aisle = sanitizeRackSegment(body.aisle || parsed.rackCode.split("-")[0] || "");
    const rack = sanitizeRackSegment(body.rack || parsed.rackCode.split("-")[1] || "");
    const productId = body.productId?.trim() || "";

    const pb = await getLocationPb(req, auth);

    if (productId) {
      const allInWh = await pb.collection(INV_COLLECTIONS.locations).getFullList({
        filter: `warehouse = "${body.warehouse}" && is_active = true`,
      });
      for (const row of allInWh) {
        const rec = row as { id: string; assigned_product?: string; name?: string };
        const cur =
          rec.assigned_product?.trim() ||
          (rec.name?.match(/\[produk:([a-z0-9]+)\]/i)?.[1] ?? "");
        if (cur === productId) {
          await persistLocation(pb, {
            id: rec.id,
            warehouse: body.warehouse,
            code: (row as { code: string }).code,
            name: getSlotDisplayName({ name: rec.name }),
            zone_type: "rack",
            assigned_product: "",
          });
        }
      }
    }

    let locationId = "";
    try {
      const existing = await pb.collection(INV_COLLECTIONS.locations).getFirstListItem(
        `warehouse = "${body.warehouse}" && code = "${slotCode.replace(/"/g, '\\"')}"`,
      );
      locationId = existing.id;
      const record = await persistLocation(pb, {
        id: locationId,
        warehouse: body.warehouse,
        code: slotCode,
        name: getSlotDisplayName(existing as { name?: string }) || buildRackSlotName(rack, level, slot),
        zone_type: "rack",
        aisle,
        level,
        bin: slot,
        assigned_product: productId,
      });
      if (!productId) {
        await clearProductDefaultForSlot(pb, locationId);
      } else {
        await syncProductDefaultForSlot(pb, productId, locationId);
      }
      return NextResponse.json({ ok: true, record, slotCode });
    } catch (err) {
      if (!(err instanceof ClientResponseError && err.status === 404)) throw err;
    }

    const created = await persistLocation(pb, {
      warehouse: body.warehouse,
      code: slotCode,
      name: buildRackSlotName(rack, level, slot),
      zone_type: "rack",
      aisle,
      level,
      bin: slot,
      assigned_product: productId,
    });

    if (productId) {
      await syncProductDefaultForSlot(pb, productId, (created as { id: string }).id);
    }

    return NextResponse.json({ ok: true, record: created, slotCode });
  } catch (err) {
    return jsonError(err, "Gagal menetapkan produk di slot.");
  }
}
