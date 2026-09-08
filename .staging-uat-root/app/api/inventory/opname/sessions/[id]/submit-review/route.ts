import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { submitOpnameForReview } from "@/lib/inventory/opname-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventoryAccess(req);
    const { id } = await ctx.params;
    const pb = await getUserPbFromRequest(req, auth);
    const session = await submitOpnameForReview(pb, id);
    return NextResponse.json({ ok: true, data: session });
  } catch (err) {
    return jsonError(err);
  }
}
