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
  company?: string;
  store?: string;
  warehouse_role?: string;
  is_primary?: boolean;
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
    const existingCodes = existing.map((w) => (w as unknown as { code: string }).code);

    const code =
      body.code?.trim().toUpperCase() ||
      suggestWarehouseCode(name, existingCodes);

    const companyId = body.company?.trim();
    const storeId = body.store?.trim();
    const role =
      body.warehouse_role?.trim() ||
      (storeId ? "retail" : companyId ? "main" : "retail");

    if (companyId && role === "main") {
      const existingMain = await pb.collection(INV_COLLECTIONS.warehouses).getFullList({
        filter: `company = "${companyId}" && is_active = true && warehouse_role = "main"`,
        fields: "id",
      });
      if (existingMain.length > 0) {
        throw new InventoryApiError(
          "Entitas ini sudah punya gudang entitas. Satu entitas = satu gudang penerimaan. Buat gudang penjualan untuk toko.",
          400,
        );
      }
    }

    if (role === "retail" && !storeId) {
      throw new InventoryApiError("Gudang penjualan wajib dipilih tokonya.", 400);
    }

    if (companyId && role === "transit") {
      const existingTransit = await pb.collection(INV_COLLECTIONS.warehouses).getFullList({
        filter: `company = "${companyId}" && is_active = true && warehouse_role = "transit"`,
        fields: "id",
      });
      if (existingTransit.length > 0) {
        throw new InventoryApiError(
          "Entitas ini sudah punya gudang sementara. Satu entitas = satu gudang sementara.",
          400,
        );
      }
    }

    if (companyId && role === "damaged") {
      const existingDamaged = await pb.collection(INV_COLLECTIONS.warehouses).getFullList({
        filter: `company = "${companyId}" && is_active = true && warehouse_role = "damaged"`,
        fields: "id",
      });
      if (existingDamaged.length > 0) {
        throw new InventoryApiError(
          "Entitas ini sudah punya gudang rusak. Satu entitas = satu gudang rusak.",
          400,
        );
      }
    }

    if ((role === "transit" || role === "damaged") && storeId) {
      throw new InventoryApiError("Gudang sementara/rusak tidak boleh ditautkan ke toko.", 400);
    }

    if (body.is_primary === true && companyId && role === "main") {
      const primaries = await pb.collection(INV_COLLECTIONS.warehouses).getFullList({
        filter: `company = "${companyId}" && is_primary = true`,
        fields: "id",
      });
      for (const row of primaries) {
        await pb.collection(INV_COLLECTIONS.warehouses).update(row.id, { is_primary: false });
      }
    }

    const warehouse = await pb.collection(INV_COLLECTIONS.warehouses).create({
      code,
      name,
      address: body.address?.trim() || "",
      company: companyId || undefined,
      store: storeId || undefined,
      warehouse_role: role,
      is_primary: role === "main" ? true : false,
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
