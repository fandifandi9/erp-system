import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { serverListAttendanceForHr } from "@/lib/hr/attendance-server";

/** GET /api/hr/attendance — scoped list (HR manage / manager team / owner). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? undefined;
    const userId = url.searchParams.get("user") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const suspicious = url.searchParams.get("suspicious") === "true";
    const page = Number(url.searchParams.get("page") ?? "1");
    const perPage = Number(url.searchParams.get("perPage") ?? "50");

    const adminPb = await getInventoryAdminPb();
    const result = await serverListAttendanceForHr(adminPb, ctx, {
      date,
      userId,
      status,
      suspicious,
      page,
      perPage,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
