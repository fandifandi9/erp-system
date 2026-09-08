import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverRejectFieldActivity } from "@/lib/hr/field-activity-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const result = await serverRejectFieldActivity(
      adminPb,
      ctx,
      id.trim(),
      String(body.reason ?? ""),
    );
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch (err) {
    return hrJsonError(err);
  }
}
