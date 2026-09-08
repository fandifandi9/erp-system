import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { submitOpnameLineCount } from "@/lib/inventory/opname-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventoryAccess(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as { line_id: string; counted_qty: number };
    const pb = await getUserPbFromRequest(req, auth);
    const line = await submitOpnameLineCount(pb, id, auth.userId, body);
    return NextResponse.json({ ok: true, data: line });
  } catch (err) {
    return jsonError(err);
  }
}
