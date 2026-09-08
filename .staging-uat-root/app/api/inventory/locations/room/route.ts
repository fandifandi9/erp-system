import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { persistLocation } from "@/lib/inventory/location-save";
import { assignProductToWarehouseRoom } from "@/lib/inventory/room-product-assign";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { suggestRoomCode } from "@/lib/inventory/location-codes";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { ClientResponseError } from "pocketbase";

type RoomBody = {
  id?: string;
  warehouse: string;
  code?: string;
  name?: string;
  /** Menambah satu produk ke ruangan (tidak mengganti produk lain di ruangan yang sama). */
  productId?: string;
};

async function getUserPb(
  req: Request,
  auth: Awaited<ReturnType<typeof requireInventoryAccess>>,
) {
  return getUserPbFromRequest(req, auth);
}

async function getPbForProductAssign(
  req: Request,
  auth: Awaited<ReturnType<typeof requireInventoryAccess>>,
) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPb(req, auth);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin.", 403);
    }

    const body = (await req.json()) as RoomBody;
    if (!body.warehouse?.trim()) {
      throw new InventoryApiError("Gudang wajib.", 400);
    }

    const pb = await getUserPb(req, auth);
    const roomName = body.name?.trim() || body.code?.trim() || "";
    if (!body.id && !roomName) {
      throw new InventoryApiError("Nama ruangan wajib.", 400);
    }

    const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne(body.warehouse, {
      fields: "code",
    });
    const whCode = (wh as unknown as { code: string }).code;
    const existing = await pb.collection(INV_COLLECTIONS.locations).getFullList({
      filter: `warehouse = "${body.warehouse}" && is_active = true`,
      fields: "code",
    });
    const existingCodes = existing.map((r) => (r as unknown as { code: string }).code);

    let code: string;
    if (body.id) {
      const cur = await pb.collection(INV_COLLECTIONS.locations).getOne(body.id, {
        fields: "code,name",
      });
      code = (cur as unknown as { code: string }).code;
    } else {
      if (!roomName) {
        throw new InventoryApiError("Nama ruangan wajib.", 400);
      }
      code = suggestRoomCode(whCode, roomName, existingCodes);
    }

    const name = roomName || code;
    const productId = body.productId?.trim() || "";

    const payload = {
      warehouse: body.warehouse,
      code,
      name,
      zone_type: "rack",
      assigned_product: "",
      preserveName: true,
    };

    let roomId = body.id;

    if (body.id) {
      await persistLocation(pb, { ...payload, id: body.id });
    } else {
      try {
        const existing = await pb.collection(INV_COLLECTIONS.locations).getFirstListItem(
          `warehouse = "${body.warehouse}" && code = "${code.replace(/"/g, '\\"')}"`,
        );
        roomId = existing.id;
        await persistLocation(pb, { ...payload, id: existing.id });
      } catch (err) {
        if (!(err instanceof ClientResponseError && err.status === 404)) throw err;
        const record = await persistLocation(pb, payload);
        roomId = (record as { id: string }).id;
      }
    }

    if (productId && roomId) {
      const assignPb = await getPbForProductAssign(req, auth);
      await assignProductToWarehouseRoom(assignPb, body.warehouse, productId, roomId);
    }

    const record = roomId
      ? await pb.collection(INV_COLLECTIONS.locations).getOne(roomId)
      : null;

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan ruangan.");
  }
}
