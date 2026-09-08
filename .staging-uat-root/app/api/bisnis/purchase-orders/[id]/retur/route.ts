import { NextResponse } from "next/server";
import { requirePembelianApiUser } from "@/lib/bisnis/api-auth";
import { createPurchaseReturFromOrder } from "@/lib/bisnis/purchase-retur-create";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return e instanceof Error ? e.message : err.message ?? fallback;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePembelianApiUser(_req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const result = await createPurchaseReturFromOrder(adminPb, id, auth.userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json(
      { ok: false, error: pbErrorMessage(e, "Gagal membuat retur pembelian") },
      { status },
    );
  }
}
