import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { stampAllPayrollItemsInPeriod } from "@/lib/hr/payroll-server";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/hr/payroll/periods/[id]/stamp-snapshots — entity snapshot on period lock. */
export async function POST(req: Request, context: Ctx) {
  try {
    await requireOwnerOrHrApiUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const count = await stampAllPayrollItemsInPeriod(adminPb, id, false);
    return NextResponse.json({ ok: true, stamped: count });
  } catch (err) {
    return hrJsonError(err);
  }
}
