import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError } from "@/lib/hr/api-auth";
import {
  serverGetTodayAttendance,
  getUserProfileAdmin,
} from "@/lib/hr/attendance-server";
import { profileRequiresCheckinSelfie } from "@/lib/attendance";
import { serverBuildTodayAttendanceContext } from "@/lib/hr/work-schedule-server";

/** GET /api/hr/attendance/today — own attendance + schedule context for today. */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const adminPb = await getInventoryAdminPb();
    const data = await serverGetTodayAttendance(adminPb, ctx);
    const { profile, office } = await getUserProfileAdmin(adminPb, ctx.userId);
    const context = await serverBuildTodayAttendanceContext(
      adminPb,
      ctx,
      (data as Record<string, unknown> | null) ?? null,
      profile,
    );

    const officePayload =
      office && Number.isFinite(Number(office.lat)) && Number.isFinite(Number(office.lng))
        ? {
            id: String(office.id),
            name: String(office.name || ""),
            lat: Number(office.lat),
            lng: Number(office.lng),
            radius: Number(office.radius) || 100,
          }
        : null;

    return NextResponse.json({
      ok: true,
      data,
      schedule: context.schedule,
      metrics: context.metrics,
      office: officePayload,
      require_checkin_selfie: profileRequiresCheckinSelfie(profile),
    });
  } catch (err) {
    return hrJsonError(err);
  }
}
