import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { serverEndWorkScheduleAssignment } from "@/lib/hr/work-schedule-server";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/hr/work-schedules/assignments/[id] — end assignment */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedHrUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    await serverEndWorkScheduleAssignment(
      adminPb,
      auth,
      id,
      body.effective_to != null ? String(body.effective_to) : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
