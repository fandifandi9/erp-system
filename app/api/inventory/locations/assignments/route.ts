import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getAssignedProductId } from "@/lib/inventory/slot-product";
import {
  isAssignableStorageLocation,
  listWarehouseRooms,
} from "@/lib/inventory/warehouse-rooms";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS, type InvLocation } from "@/lib/inventory/types";

export type RoomProductSummary = { id: string; sku: string; name: string };

async function getPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const url = new URL(req.url);
    const warehouse = url.searchParams.get("warehouse")?.trim();
    if (!warehouse) {
      return NextResponse.json({ ok: false, error: "warehouse wajib." }, { status: 400 });
    }

    const auth = await requireInventoryAccess(req);
    const pb = await getPb(req, auth);

    const whRow = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouse, {
      fields: "code",
    });
    const whCode = String((whRow as { code?: string }).code ?? "").trim();

    const all = (await pb.collection(INV_COLLECTIONS.locations).getFullList({
      filter: `warehouse = "${warehouse}" && is_active = true`,
      sort: "code",
    })) as unknown as InvLocation[];

    const rooms = listWarehouseRooms(all, whCode);
    const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));
    const byProductId: Record<string, InvLocation> = {};
    const byRoomId: Record<string, RoomProductSummary[]> = {};

    const addToRoom = (room: InvLocation, product: RoomProductSummary) => {
      byProductId[product.id] = room;
      const list = byRoomId[room.id] ?? [];
      if (!list.some((p) => p.id === product.id)) {
        byRoomId[room.id] = [...list, product];
      }
    };

    const products = await pb.collection(INV_COLLECTIONS.products).getFullList({
      filter: `is_active = true && default_location != ""`,
      fields: "id,sku,name,default_location",
      expand: "default_location",
    });

    for (const row of products) {
      const p = row as unknown as {
        id: string;
        sku: string;
        name: string;
        default_location: string;
        expand?: { default_location?: InvLocation };
      };
      const loc = p.expand?.default_location;
      if (!loc?.id || loc.warehouse !== warehouse || !isAssignableStorageLocation(loc, whCode)) {
        continue;
      }
      const room = roomById[loc.id] ?? loc;
      addToRoom(room, { id: p.id, sku: p.sku, name: p.name });
    }

    for (const room of rooms) {
      const pid = getAssignedProductId(room);
      if (!pid || byProductId[pid]) continue;
      try {
        const p = await pb.collection(INV_COLLECTIONS.products).getOne(pid, {
          fields: "id,sku,name",
        });
        addToRoom(room, p as unknown as RoomProductSummary);
      } catch {
        /* produk tidak ada */
      }
    }

    return NextResponse.json({ ok: true, rooms, slots: rooms, byProductId, byRoomId });
  } catch (err) {
    return jsonError(err, "Gagal memuat penempatan ruangan.");
  }
}
