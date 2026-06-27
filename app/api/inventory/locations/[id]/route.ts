import { NextResponse } from "next/server";
import {
  InventoryApiError,
  jsonError,
  requireInventoryAccess,
} from "@/lib/inventory/api-auth";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import {
  persistLocation,
  persistLocationDeactivate,
  persistLocationDelete,
  type LocationSaveInput,
} from "@/lib/inventory/location-save";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type RouteCtx = { params: Promise<{ id: string }> };

async function getLocationPb(req: Request, auth: Awaited<ReturnType<typeof requireInventoryAccess>>) {
  try {
    return await getInventoryAdminPb();
  } catch {
    return getUserPbFromRequest(req, auth);
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin mengelola lokasi rak.", 403);
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as LocationSaveInput & { deactivate?: boolean };
    const pb = await getLocationPb(req, auth);

    if (body.deactivate === true) {
      const record = await persistLocationDeactivate(pb, id);
      return NextResponse.json({ ok: true, record });
    }

    if (!body.warehouse?.trim() || !body.code?.trim()) {
      throw new InventoryApiError("Gudang dan kode lokasi wajib diisi.", 400);
    }

    const record = await persistLocation(pb, { ...body, id });
    return NextResponse.json({ ok: true, record });
  } catch (err) {
    return jsonError(err, "Gagal memperbarui lokasi rak.");
  }
}

export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireInventoryAccess(req);
    if (!canManageWarehouseLocations(auth.user)) {
      throw new InventoryApiError("Tidak punya izin menghapus lokasi rak.", 403);
    }

    const { id } = await ctx.params;
    const pb = await getLocationPb(req, auth);

    let usedCount = 0;
    try {
      const used = await pb.collection(INV_COLLECTIONS.products).getFullList({
        filter: `default_location = "${id}"`,
        fields: "id",
      });
      usedCount += used.length;
    } catch {
      /* skip */
    }
    try {
      const placed = await pb.collection(INV_COLLECTIONS.productPlacements).getFullList({
        filter: `location = "${id}" && is_active != false`,
        fields: "id",
      });
      usedCount += placed.length;
    } catch {
      /* collection belum ada */
    }
    if (usedCount > 0) {
      throw new InventoryApiError(
        `${usedCount} produk masih memakai slot ini. Pindahkan penempatan di Daftar Produk dulu.`,
        400,
      );
    }

    await persistLocationDelete(pb, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err, "Gagal menghapus lokasi rak.");
  }
}
