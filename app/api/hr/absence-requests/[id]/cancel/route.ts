import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError, HrApiError } from "@/lib/hr/api-auth";
import { serverCancelAbsenceRequest } from "@/lib/hr/absence-request-server";

export async function POST(
  req: Request,
  ctxParams: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const adminPb = await getInventoryAdminPb();
    const result = await serverCancelAbsenceRequest(adminPb, ctx, id);
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message, id: result.id });
  } catch (err) {
    return hrJsonError(err);
  }
}
