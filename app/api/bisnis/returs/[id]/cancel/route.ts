import { NextResponse } from "next/server";
import { requirePembelianApiUser, requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { cancelRetur } from "@/lib/bisnis/retur-cancel";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return e instanceof Error ? e.message : err.message ?? fallback;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);
    const auth =
      retur.type === "pembelian"
        ? await requirePembelianApiUser(req)
        : await requirePenjualanApiUser(req);
    const updated = await cancelRetur(adminPb, id, auth.userId, body.reason);

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal membatalkan retur") },
      { status },
    );
  }
}
