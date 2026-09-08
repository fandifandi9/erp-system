import { NextResponse } from "next/server";
import { jsonError, requireInventorySupervisorAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { voidStockMovement } from "@/lib/inventory/stock-engine";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireInventorySupervisorAccess(req);
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID movement wajib." }, { status: 400 });
    }

    let note: string | undefined;
    try {
      const body = (await req.json()) as { note?: string };
      note = body.note;
    } catch {
      /* body opsional */
    }

    const pb = await getInventoryAdminPb();
    const result = await voidStockMovement(pb, id, auth.userId, note);

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
