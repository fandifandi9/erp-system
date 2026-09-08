import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { sendSalesOrderToWarehouseServer } from "@/lib/bisnis/sales-warehouse-server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const updated = await sendSalesOrderToWarehouseServer(id, auth.userId);
    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    const message =
      e instanceof Error ? e.message : err.message ?? "Gagal mengirim SO ke gudang.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
