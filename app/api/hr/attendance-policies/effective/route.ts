import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getEffectiveAttendancePolicyForUser } from "@/lib/hr/entity-attendance-policy-server";

/** GET /api/hr/attendance-policies/effective — staff effective structured policy. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const url = new URL(req.url);
    const asOf = url.searchParams.get("as_of") || undefined;
    const data = await getEffectiveAttendancePolicyForUser(adminPb, ctx, asOf);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
