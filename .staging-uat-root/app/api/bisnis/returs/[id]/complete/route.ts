import { NextResponse } from "next/server";
import { requirePembelianApiUser, requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { completeRetur } from "@/lib/bisnis/retur-complete";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Field retur belum ada di PocketBase. Jalankan: npm run pb:retur-schema";
  }
  return raw;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);
    const auth =
      retur.type === "pembelian"
        ? await requirePembelianApiUser(req)
        : await requirePenjualanApiUser(req);
    const result = await completeRetur(adminPb, id, auth.userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal menyelesaikan retur") },
      { status },
    );
  }
}
