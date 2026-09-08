import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { persistLocation, type LocationSaveInput } from "@/lib/inventory/location-save";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";

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
      throw new InventoryApiError("Tidak punya izin mengelola lokasi rak.", 403);
    }

    const body = (await req.json()) as LocationSaveInput;
    if (!body.warehouse?.trim() || !body.code?.trim()) {
      throw new InventoryApiError("Gudang dan kode lokasi wajib diisi.", 400);
    }
    if (!body.zone_type?.trim()) {
      throw new InventoryApiError("Tipe lokasi wajib diisi.", 400);
    }

    const pb = await getLocationPb(req, auth);
    const record = await persistLocation(pb, body);
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return jsonError(err, "Gagal menyimpan lokasi rak.");
  }
}
