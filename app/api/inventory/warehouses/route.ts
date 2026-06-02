import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { parseRoomNamesInput, suggestRoomCode, suggestWarehouseCode } from "@/lib/inventory/location-codes";
import { persistLocation } from "@/lib/inventory/location-save";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type CreateBody = {
  name: string;
  code?: string;
  address?: string;
  roomNames?: string[];
  roomsText?: string;
};

async function getPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
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

    const body = (await req.json()) as CreateBody;
    const name = body.name?.trim();
    if (!name) {
      throw new InventoryApiError("Nama gudang wajib.", 400);
    }

    const pb = await getPb(req, auth);
    const existing = await pb.collection(INV_COLLECTIONS.warehouses).getFullList({
      fields: "code",
    });
    const existingCodes = existing.map((w) => (w as { code: string }).code);

    const code =
      body.code?.trim().toUpperCase() ||
      suggestWarehouseCode(name, existingCodes);

    const warehouse = await pb.collection(INV_COLLECTIONS.warehouses).create({
      code,
      name,
      address: body.address?.trim() || "",
      is_active: true,
      timezone: "Asia/Jakarta",
    });

    const roomNames = [
      ...(body.roomNames ?? []),
      ...parseRoomNamesInput(body.roomsText ?? ""),
    ].filter(Boolean);

    const uniqueNames = [...new Set(roomNames)];
    const roomCodes: string[] = [];
    const createdRooms = [];

    for (const roomName of uniqueNames) {
      const roomCode = suggestRoomCode(code, roomName, roomCodes);
      roomCodes.push(roomCode);
      const record = await persistLocation(pb, {
        warehouse: warehouse.id,
        code: roomCode,
        name: roomName,
        zone_type: "rack",
        assigned_product: "",
        preserveName: true,
      });
      createdRooms.push(record);
    }

    return NextResponse.json({
      ok: true,
      warehouse,
      rooms: createdRooms,
      roomCount: createdRooms.length,
    });
  } catch (err) {
    return jsonError(err, "Gagal membuat gudang.");
  }
}
