import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { serverUpdateWorkSchedule } from "@/lib/hr/work-schedule-server";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/hr/work-schedules/[id] */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedHrUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    await serverUpdateWorkSchedule(adminPb, auth, id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
