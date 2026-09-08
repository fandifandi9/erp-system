import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { serverPreviewAssignment } from "@/lib/hr/rating-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const url = new URL(req.url);
    const adminPb = await getInventoryAdminPb();
    const data = await serverPreviewAssignment(adminPb, ctx, {
      period_id: String(url.searchParams.get("period_id") || ""),
      subject_user_id: String(url.searchParams.get("subject_user_id") || ""),
      reviewer_count: Number(url.searchParams.get("reviewer_count") || 0),
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
