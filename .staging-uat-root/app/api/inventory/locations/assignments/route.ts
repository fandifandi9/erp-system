import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getAssignedProductId } from "@/lib/inventory/slot-product";
import {
  loadWarehouseProductPlacements,
  mergeLegacyDefaultLocations,
} from "@/lib/inventory/product-warehouse-placement";
import { listWarehouseRooms } from "@/lib/inventory/warehouse-rooms";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS, type InvLocation } from "@/lib/inventory/types";

export type RoomProductSummary = { id: string; sku: string; name: string };

async function getUserPb(
  req: Request,
  auth: Awaited<ReturnType<typeof requireInventoryAccess>>,
) {
  return getUserPbFromRequest(req, auth);
}

async function getPbForReads(
  req: Request,
  auth: Awaited<ReturnType<typeof requireInventoryAccess>>,
) {
  try {
    return await getUserPb(req, auth);
  } catch {
    try {
      return await getInventoryAdminPb();
    } catch {
      return getUserPb(req, auth);
    }
  }
}

function parseProductIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const warehouse = url.searchParams.get("warehouse")?.trim();
    if (!warehouse) {
      return NextResponse.json({ ok: false, error: "warehouse wajib." }, { status: 400 });
    }

    const auth = await requireInventoryAccess(req);
    const pb = await getPbForReads(req, auth);
    const productIds = parseProductIds(url.searchParams.get("products"));

    const whRow = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouse, {
      fields: "code,name",
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

    const fromPlacements = await loadWarehouseProductPlacements(
      pb,
      warehouse,
      roomById,
      productIds.length > 0 ? productIds : undefined,
    );
    Object.assign(byProductId, fromPlacements);

    await mergeLegacyDefaultLocations(
      pb,
      warehouse,
      roomById,
      byProductId,
      productIds.length > 0 ? productIds : undefined,
    );

    const placedIds = Object.keys(byProductId);
    if (placedIds.length > 0) {
      const pf = placedIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
      const products = (await pb.collection(INV_COLLECTIONS.products).getFullList({
        filter: pf,
        fields: "id,sku,name",
      })) as RoomProductSummary[];
      for (const p of products) {
        const room = byProductId[p.id];
        if (room) addToRoom(room, p);
      }
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

    return NextResponse.json({
      ok: true,
      rooms,
      slots: rooms,
      byProductId,
      byRoomId,
      warehouseCode: whCode,
      warehouseName: (whRow as { name?: string }).name ?? "",
      multiWarehousePlacements: true,
    });
  } catch (err) {
    return jsonError(err, "Gagal memuat penempatan slot.");
  }
}
