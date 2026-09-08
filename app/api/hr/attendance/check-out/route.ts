import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
} from "@/lib/hr/api-auth";
import {
  rejectClientAttendanceForgeFields,
  serverCheckOut,
} from "@/lib/hr/attendance-server";

/** POST /api/hr/attendance/check-out — authenticated employee check-out. */
export async function POST(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    rejectClientPrivilegeFields(body);
    rejectClientAttendanceForgeFields(body);

    const adminPb = await getInventoryAdminPb();
    const result = await serverCheckOut(adminPb, ctx);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.message, message: result.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      data: result.data,
      id: result.id,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}
