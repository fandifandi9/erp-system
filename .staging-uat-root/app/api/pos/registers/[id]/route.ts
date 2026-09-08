import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { POS_COLLECTIONS, type PosRegister } from "@/lib/pos/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const body = (await req.json()) as Partial<PosRegister>;
    const row = await adminPb.collection(POS_COLLECTIONS.registers).update<PosRegister>(id, {
      ...(body.code !== undefined ? { code: body.code.trim() } : {}),
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.address !== undefined ? { address: body.address?.trim() || undefined } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || undefined } : {}),
      ...(body.is_active !== undefined ? { is_active: body.is_active } : {}),
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal mengubah terminal POS" },
      { status },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requirePenjualanApiUser(_req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    await adminPb.collection(POS_COLLECTIONS.registers).delete(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : err.message ?? "Gagal menghapus terminal POS" },
      { status },
    );
  }
}
