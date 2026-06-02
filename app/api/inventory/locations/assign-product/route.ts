import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import {
  assignProductToWarehouseRoom,
  unassignProductFromWarehouseRoom,
} from "@/lib/inventory/room-product-assign";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";

type Body = {
  warehouse: string;
  productId: string;
  roomId?: string | null;
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

    const body = (await req.json()) as Body;
    if (!body.warehouse?.trim() || !body.productId?.trim()) {
      throw new InventoryApiError("Gudang dan produk wajib.", 400);
    }

    const pb = await getPbForProductAssign(req, auth);

    const roomId = body.roomId?.trim() || "";

    if (roomId) {
      await assignProductToWarehouseRoom(pb, body.warehouse, body.productId, roomId);
    } else {
      await unassignProductFromWarehouseRoom(pb, body.warehouse, body.productId);
    }

    return NextResponse.json({ ok: true, roomId: roomId || null });
  } catch (err) {
    return jsonError(err, "Gagal mengatur penempatan produk.");
  }
}
