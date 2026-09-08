import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import {
  listManageableAttendancePolicies,
  upsertAttendancePolicy,
} from "@/lib/hr/entity-attendance-policy-server";

/** GET /api/hr/attendance-policies — HR list structured attendance policies. */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await listManageableAttendancePolicies(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/attendance-policies — create/update structured attendance policy. */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const data = await upsertAttendancePolicy(adminPb, ctx, {
      id: body.id != null ? String(body.id) : undefined,
      company_id: body.company_id != null ? String(body.company_id) : undefined,
      effective_from: body.effective_from != null ? String(body.effective_from) : undefined,
      effective_until: body.effective_until != null ? String(body.effective_until) : undefined,
      late_enabled: body.late_enabled === true || body.late_enabled === false ? body.late_enabled : undefined,
      late_grace_minutes:
        body.late_grace_minutes != null ? Number(body.late_grace_minutes) : undefined,
      late_rate_per_minute:
        body.late_rate_per_minute != null ? Number(body.late_rate_per_minute) : undefined,
      absence_enabled:
        body.absence_enabled === true || body.absence_enabled === false ? body.absence_enabled : undefined,
      absence_rate_per_day:
        body.absence_rate_per_day != null ? Number(body.absence_rate_per_day) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
      publish: body.publish === true,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
