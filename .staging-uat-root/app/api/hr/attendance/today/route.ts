import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError } from "@/lib/hr/api-auth";
import { serverGetTodayAttendance } from "@/lib/hr/attendance-server";

/** GET /api/hr/attendance/today — own attendance record for today. */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const adminPb = await getInventoryAdminPb();
    const data = await serverGetTodayAttendance(adminPb, ctx);

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
