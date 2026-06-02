import { NextResponse } from "next/server";
import {
  jsonError,
  requireInventoryAccess,
  requireInventoryPostAccess,
} from "@/lib/inventory/api-auth";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { completePackingSession } from "@/lib/inventory/packing-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventoryAccess(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as { post_out?: boolean };

    const pb = await getUserPbFromRequest(req, auth);
    let adminPb;
    if (body.post_out) {
      await requireInventoryPostAccess(req);
      adminPb = await getInventoryAdminPb();
    }

    const result = await completePackingSession(pb, id, auth.userId, {
      postOut: body.post_out,
      adminPb,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
