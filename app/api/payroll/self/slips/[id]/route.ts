import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getSelfPayslipById } from "@/lib/hr/payroll-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/payroll/self/slips/[id] — ownership enforced server-side. */
export async function GET(req: Request, context: Ctx) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const slip = await getSelfPayslipById(adminPb, ctx, id, req);
    return NextResponse.json({ ok: true, data: slip });
  } catch (err) {
    return hrJsonError(err);
  }
}
