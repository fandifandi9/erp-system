import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverGetRatingDashboard } from "@/lib/hr/rating-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const data = await serverGetRatingDashboard(adminPb, ctx);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
