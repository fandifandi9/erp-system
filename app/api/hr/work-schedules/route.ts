import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import {
  serverCreateWorkSchedule,
  serverListWorkSchedules,
} from "@/lib/hr/work-schedule-server";

/** GET /api/hr/work-schedules — list schedules in company scope. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId") || undefined;
    const adminPb = await getInventoryAdminPb();
    const items = await serverListWorkSchedules(adminPb, ctx, companyId || undefined);
    return NextResponse.json({ ok: true, data: items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/work-schedules — create schedule + default days. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const result = await serverCreateWorkSchedule(adminPb, ctx, {
      company: String(body.company || ""),
      name: String(body.name || ""),
      code: body.code != null ? String(body.code) : undefined,
      schedule_type: body.schedule_type != null ? String(body.schedule_type) : undefined,
      timezone: body.timezone != null ? String(body.timezone) : undefined,
      effective_from: body.effective_from != null ? String(body.effective_from) : undefined,
      effective_to: body.effective_to != null ? String(body.effective_to) : undefined,
      late_grace_minutes:
        body.late_grace_minutes != null ? Number(body.late_grace_minutes) : undefined,
      early_leave_grace_minutes:
        body.early_leave_grace_minutes != null
          ? Number(body.early_leave_grace_minutes)
          : undefined,
      days: Array.isArray(body.days) ? (body.days as never[]) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
