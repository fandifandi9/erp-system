import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverListRecruitablePositions } from "@/lib/hr/recruitable-positions-server";

/**
 * GET /api/hr/org-positions/recruitable?companyId=
 * Vacant org positions the actor may fill (authority + company scope).
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const adminPb = await getInventoryAdminPb();
    const result = await serverListRecruitablePositions(adminPb, ctx, {
      companyId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
