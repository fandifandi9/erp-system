import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { getSelfPayrollBankView } from "@/lib/hr/payroll-bank-account-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const adminPb = await getInventoryAdminPb();
    const data = await getSelfPayrollBankView(adminPb, ctx.userId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    if (body.user != null || body.user_id != null || body.status != null) {
      const { HrApiError } = await import("@/lib/hr/api-auth");
      throw new HrApiError("Field identity/status tidak boleh dikirim oleh klien.", 400);
    }

    const { submitPayrollBankChangeRequest } = await import("@/lib/hr/payroll-bank-account-server");
    const adminPb = await getInventoryAdminPb();
    const data = await submitPayrollBankChangeRequest(adminPb, ctx, {
      bank_name: String(body.bank_name ?? ""),
      account_number: String(body.account_number ?? ""),
      account_holder_name: String(body.account_holder_name ?? ""),
      note: body.note != null ? String(body.note) : undefined,
      evidence_document_id: body.evidence_document_id != null ? String(body.evidence_document_id) : undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
