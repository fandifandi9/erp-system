import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { settleSalesReturFinance } from "@/lib/bisnis/sales-retur-complete";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Retur } from "@/lib/bisnis/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return e instanceof Error ? e.message : err.message ?? fallback;
}

/** POST settlement finance saja — setelah stok sudah diposting. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const retur = await adminPb.collection(BISNIS_COLLECTIONS.returs).getOne<Retur>(id);
    if (retur.type !== "penjualan") {
      return NextResponse.json({ ok: false, error: "Hanya retur penjualan" }, { status: 400 });
    }
    const result = await settleSalesReturFinance(adminPb, id, auth.userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal menyelesaikan settlement retur") },
      { status },
    );
  }
}
