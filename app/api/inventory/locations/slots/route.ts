import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { buildSlotCodeForRack, getRackLayout, parseSlotFromLocationCode } from "@/lib/inventory/rack-layout";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS, type InvLocation } from "@/lib/inventory/types";

async function getLocationPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

/** Daftar slot suatu rak + produk yang ditetapkan. */
export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const url = new URL(req.url);
    const warehouse = url.searchParams.get("warehouse")?.trim();
    const rackCode = url.searchParams.get("rackCode")?.trim().toUpperCase();
    if (!warehouse || !rackCode) {
      return NextResponse.json({ ok: false, error: "warehouse dan rackCode wajib." }, { status: 400 });
    }

    const auth = await requireInventoryAccess(req);
    const pb = await getLocationPb(req, auth);

    let master: InvLocation | null = null;
    try {
      master = (await pb.collection(INV_COLLECTIONS.locations).getFirstListItem(
        `warehouse = "${warehouse}" && code = "${rackCode.replace(/"/g, '\\"')}"`,
      )) as unknown as InvLocation;
    } catch {
      return NextResponse.json({ ok: true, master: null, slots: [] });
    }

    const layout = getRackLayout(master);
    const prefix = `${rackCode}-`;
    const all = await pb.collection(INV_COLLECTIONS.locations).getFullList({
      filter: `warehouse = "${warehouse}" && is_active = true`,
      sort: "code",
      expand: "assigned_product",
    });

    const slots = (all as unknown as InvLocation[])
      .filter((loc) => loc.code !== rackCode && loc.code.startsWith(prefix))
      .map((loc) => {
        if (loc.level?.trim() && loc.bin?.trim()) return loc;
        const parsed = parseSlotFromLocationCode(loc.code);
        return {
          ...loc,
          level: loc.level?.trim() || parsed.level,
          bin: loc.bin?.trim() || parsed.slot,
        };
      });

    if (layout) {
      for (const level of layout.levels) {
        for (const slot of layout.slots) {
          const expected = buildSlotCodeForRack(rackCode, level, slot);
          if (!slots.some((s) => s.code === expected)) {
            slots.push({
              id: "",
              code: expected,
              warehouse,
              level,
              bin: slot,
              zone_type: "rack",
              aisle: rackCode.split("-")[0],
            } as InvLocation);
          }
        }
      }
      slots.sort((a, b) => a.code.localeCompare(b.code));
    }

    return NextResponse.json({ ok: true, master, layout, slots });
  } catch (err) {
    return jsonError(err, "Gagal memuat slot rak.");
  }
}
