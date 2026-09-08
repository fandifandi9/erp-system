import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverListRatingResults } from "@/lib/hr/rating-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const periodId = new URL(req.url).searchParams.get("period") || undefined;
    const adminPb = await getInventoryAdminPb();
    const items = await serverListRatingResults(adminPb, ctx, periodId);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}
