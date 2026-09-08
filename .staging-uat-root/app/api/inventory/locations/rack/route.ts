import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { persistLocation } from "@/lib/inventory/location-save";
import {
  buildRackCode,
  buildSlotCodeForRack,
  encodeLayoutInName,
  getRackDisplayName,
  listSlotCodesForLayout,
  type RackLayout,
} from "@/lib/inventory/rack-layout";
import { buildRackSlotName, sanitizeRackSegment } from "@/lib/inventory/rack-builder";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { ClientResponseError } from "pocketbase";

type RackBody = {
  warehouse: string;
  aisle: string;
  rack: string;
  name?: string;
  levels: string[];
  slots: string[];
  id?: string;
};

async function getLocationPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

function normalizeLayout(levels: string[], slots: string[]): RackLayout {
  const lv = levels.map((x) => x.trim()).filter(Boolean);
  const sl = slots.map((x) => x.trim()).filter(Boolean);
  if (lv.length === 0 || sl.length === 0) {
    throw new InventoryApiError("Minimal satu tingkat dan satu slot.", 400);
  }
  return { levels: lv, slots: sl };
}

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin mengelola lokasi rak.", 403);
    }

    const body = (await req.json()) as RackBody;
    if (!body.warehouse?.trim()) {
      throw new InventoryApiError("Gudang wajib dipilih.", 400);
    }

    const aisle = sanitizeRackSegment(body.aisle);
    const rack = sanitizeRackSegment(body.rack);
    const rackCode = buildRackCode(aisle, rack);
    if (!rackCode) {
      throw new InventoryApiError("Lorong dan kode rak wajib diisi.", 400);
    }

    const layout = normalizeLayout(body.levels ?? [], body.slots ?? []);
    const displayName = (body.name?.trim() || `Rak ${rack}`).trim();
    const masterName = encodeLayoutInName(displayName, layout);

    const pb = await getLocationPb(req, auth);

    let masterId = body.id?.trim();
    if (masterId) {
      await persistLocation(pb, {
        id: masterId,
        warehouse: body.warehouse,
        code: rackCode,
        name: masterName,
        zone_type: "rack",
        aisle,
        preserveName: true,
      });
    } else {
      try {
        const existing = await pb
          .collection(INV_COLLECTIONS.locations)
          .getFirstListItem(
            `warehouse = "${body.warehouse}" && code = "${rackCode.replace(/"/g, '\\"')}"`,
          );
        masterId = existing.id;
        await persistLocation(pb, {
          id: masterId,
          warehouse: body.warehouse,
          code: rackCode,
          name: masterName,
          zone_type: "rack",
          aisle,
          preserveName: true,
        });
      } catch (err) {
        if (!(err instanceof ClientResponseError && err.status === 404)) throw err;
        const created = await persistLocation(pb, {
          warehouse: body.warehouse,
          code: rackCode,
          name: masterName,
          zone_type: "rack",
          aisle,
          preserveName: true,
        });
        masterId = (created as { id: string }).id;
      }
    }

    let slotsCreated = 0;
    let slotsSkipped = 0;
    for (const level of layout.levels) {
      for (const slot of layout.slots) {
        const slotCode = buildSlotCodeForRack(rackCode, level, slot);
        try {
          await pb
            .collection(INV_COLLECTIONS.locations)
            .getFirstListItem(
              `warehouse = "${body.warehouse}" && code = "${slotCode.replace(/"/g, '\\"')}"`,
            );
          slotsSkipped += 1;
        } catch (err) {
          if (!(err instanceof ClientResponseError && err.status === 404)) {
            throw err;
          }
          await persistLocation(pb, {
            warehouse: body.warehouse,
            code: slotCode,
            name: buildRackSlotName(rack, level, slot),
            zone_type: "rack",
            aisle,
            level,
            bin: slot,
          });
          slotsCreated += 1;
        }
      }
    }

    const master = await pb.collection(INV_COLLECTIONS.locations).getOne(masterId!);

    return NextResponse.json({
      ok: true,
      master,
      rackCode,
      layout,
      slotsCreated,
      slotsSkipped,
      slotCodes: listSlotCodesForLayout(rackCode, layout),
    });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan rak.");
  }
}
