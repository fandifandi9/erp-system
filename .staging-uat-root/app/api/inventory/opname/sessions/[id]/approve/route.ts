import { NextResponse } from "next/server";
import { jsonError, requireInventorySupervisorAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb, getUserPbFromRequest } from "@/lib/inventory/pb-server";
import { approveAndPostOpname } from "@/lib/inventory/opname-engine";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireInventorySupervisorAccess(req);
    const { id } = await ctx.params;
    const pb = await getUserPbFromRequest(req, auth);
    const adminPb = await getInventoryAdminPb();
    const result = await approveAndPostOpname(pb, adminPb, id, auth.userId);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
