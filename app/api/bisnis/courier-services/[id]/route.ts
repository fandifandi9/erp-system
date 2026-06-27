import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type CourierService } from "@/lib/bisnis/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as Partial<CourierService>;
    const adminPb = await getInventoryAdminPb();
    const row = await adminPb
      .collection(BISNIS_COLLECTIONS.courierServices)
      .update<CourierService>(id, body);
    return NextResponse.json(row);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal mengubah layanan" },
      { status },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(_req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    await adminPb.collection(BISNIS_COLLECTIONS.courierServices).delete(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal menghapus layanan" },
      { status },
    );
  }
}
