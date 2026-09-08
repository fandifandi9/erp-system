import { NextResponse } from "next/server";
import { requirePembelianApiUser } from "@/lib/bisnis/api-auth";
import { finalizePurchaseReceiving } from "@/lib/bisnis/purchase-receiving-finalize";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePembelianApiUser(req);
    const { id } = await ctx.params;
    const result = await finalizePurchaseReceiving(id, auth.userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    const message = e instanceof Error ? e.message : "Gagal menyelesaikan penerimaan";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
