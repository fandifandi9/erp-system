import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { serverAssignWorkSchedule } from "@/lib/hr/work-schedule-server";

/** POST /api/hr/work-schedules/assignments */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const result = await serverAssignWorkSchedule(adminPb, ctx, {
      userId: String(body.userId || body.user_id || ""),
      scheduleId: String(body.scheduleId || body.schedule_id || ""),
      effective_from: String(body.effective_from || ""),
      effective_to: body.effective_to != null ? String(body.effective_to) : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
