import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import {
  serverSubmitOvertimeStaff,
  serverListPendingOvertimeForHr,
  serverListOvertimeForHrScope,
} from "@/lib/hr/overtime-server";

/** GET /api/hr/overtime?pendingForApprover=1 | forHrMonitor=1 */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const url = new URL(req.url);
    const adminPb = await getInventoryAdminPb();
    if (url.searchParams.get("forHrMonitor") === "1") {
      const items = await serverListOvertimeForHrScope(adminPb, ctx);
      return NextResponse.json({ ok: true, items, total: items.length });
    }
    if (url.searchParams.get("pendingForApprover") === "1") {
      const items = await serverListPendingOvertimeForHr(adminPb, ctx);
      return NextResponse.json({ ok: true, items, total: items.length });
    }
    return NextResponse.json(
      { ok: false, error: "Gunakan pendingForApprover=1 atau forHrMonitor=1." },
      { status: 400 },
    );
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
    const result = await serverSubmitOvertimeStaff(adminPb, ctx, {
      work_date: String(body.work_date ?? ""),
      start_time: String(body.start_time ?? ""),
      end_time: String(body.end_time ?? ""),
      hours: Number(body.hours),
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
