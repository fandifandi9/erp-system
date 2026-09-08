import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  HrApiError,
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { serverRejectRecruitmentRequest } from "@/lib/hr/recruitment-request-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) throw new HrApiError("ID wajib.", 400);
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);

    const adminPb = await getInventoryAdminPb();
    const data = await serverRejectRecruitmentRequest(
      adminPb,
      ctx,
      id.trim(),
      String(body.reason ?? body.rejection_reason ?? ""),
    );
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
