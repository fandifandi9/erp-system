import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import {
  serverSubmitFieldActivity,
  serverListPendingFieldActivityForApprover,
} from "@/lib/hr/field-activity-server";

/** GET /api/hr/field-activity?pendingForApprover=1 — scoped field queue */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const url = new URL(req.url);
    if (url.searchParams.get("pendingForApprover") !== "1") {
      return NextResponse.json(
        { ok: false, error: "Gunakan pendingForApprover=1." },
        { status: 400 },
      );
    }
    const adminPb = await getInventoryAdminPb();
    const items = await serverListPendingFieldActivityForApprover(adminPb, ctx);
    return NextResponse.json({ ok: true, items, total: items.length });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request) {
  try {
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
    const result = await serverSubmitFieldActivity(adminPb, ctx, {
      start_date: String(body.start_date ?? ""),
      end_date: String(body.end_date ?? ""),
      activity_type: String(body.activity_type ?? "other"),
      destination: String(body.destination ?? ""),
      reason: String(body.reason ?? ""),
    });
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: result.id, message: result.message });
  } catch (err) {
    return hrJsonError(err);
  }
}
