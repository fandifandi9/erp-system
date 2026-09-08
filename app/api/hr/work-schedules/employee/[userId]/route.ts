import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverGetEmployeeScheduleContext } from "@/lib/hr/work-schedule-server";
import { computeAttendanceMetrics } from "@/lib/hr/work-schedule-calc";

type Ctx = { params: Promise<{ userId: string }> };

/** GET /api/hr/work-schedules/employee/[userId] — schedule + assignment history */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await requireAuthenticatedHrUser(req);
    const { userId } = await ctx.params;
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || undefined;
    const checkIn = url.searchParams.get("check_in");
    const checkOut = url.searchParams.get("check_out");
    const adminPb = await getInventoryAdminPb();
    const result = await serverGetEmployeeScheduleContext(adminPb, auth, userId, date);

    let metrics = null;
    if (checkIn || checkOut) {
      metrics = computeAttendanceMetrics({
        businessDate: result.schedule.businessDate,
        scheduledStart: result.schedule.startTime,
        scheduledEnd: result.schedule.endTime,
        actualCheckIn: checkIn,
        actualCheckOut: checkOut,
        timezone: result.schedule.timezone,
        lateGraceMinutes: result.schedule.lateGraceMinutes,
        earlyLeaveGraceMinutes: result.schedule.earlyLeaveGraceMinutes,
        isWorkingDay: result.schedule.isWorkingDay,
      });
    }

    return NextResponse.json({ ok: true, data: { ...result, metrics } });
  } catch (err) {
    return hrJsonError(err);
  }
}
