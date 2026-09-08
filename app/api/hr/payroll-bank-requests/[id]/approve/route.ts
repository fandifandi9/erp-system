import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { approvePayrollBankChangeRequest } from "@/lib/hr/payroll-bank-account-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const effectiveFrom = body.effective_from != null ? String(body.effective_from) : undefined;
    await approvePayrollBankChangeRequest(adminPb, ctx, id, { effective_from: effectiveFrom });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
