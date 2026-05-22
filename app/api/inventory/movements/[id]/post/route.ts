import { NextResponse } from "next/server";
import { jsonError, requireInventoryPostAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { postStockMovement } from "@/lib/inventory/stock-engine";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireInventoryPostAccess(req);
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID movement wajib." }, { status: 400 });
    }

    const pb = await getInventoryAdminPb();
    const result = await postStockMovement(pb, id, auth.userId);

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
