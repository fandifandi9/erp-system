import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { getOpnameSessionDetail } from "@/lib/inventory/opname-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventoryAccess(req);
    const { id } = await ctx.params;
    const pb = await getUserPbFromRequest(req, auth);
    const detail = await getOpnameSessionDetail(pb, id);
    return NextResponse.json({ ok: true, data: detail });
  } catch (err) {
    return jsonError(err);
  }
}
