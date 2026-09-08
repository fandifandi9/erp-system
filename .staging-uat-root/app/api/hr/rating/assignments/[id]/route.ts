import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverGetAssignmentDetail } from "@/lib/hr/rating-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const detail = await serverGetAssignmentDetail(adminPb, auth, id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    return hrJsonError(err);
  }
}
