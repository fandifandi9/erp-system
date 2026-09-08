import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientPrivilegeFields,
  requireOwnerOrHrApiUser,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverCorrectAttendance } from "@/lib/hr/attendance-server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/hr/attendance/[id]/correct
 * HR/Owner manual correction with required reason + audit trail.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    rejectClientPrivilegeFields(body);
    // Identity / company never from client on correction.
    for (const key of ["user", "userId", "user_id", "company", "company_id", "date"] as const) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        throw new HrApiError(`Field '${key}' tidak boleh dikirim pada koreksi.`, 400);
      }
    }

    const adminPb = await getInventoryAdminPb();
    const result = await serverCorrectAttendance(adminPb, auth, id, {
      reason: body.reason != null ? String(body.reason) : "",
      check_in: Object.prototype.hasOwnProperty.call(body, "check_in")
        ? (body.check_in as string | null)
        : undefined,
      check_out: Object.prototype.hasOwnProperty.call(body, "check_out")
        ? (body.check_out as string | null)
        : undefined,
      clear_check_out: body.clear_check_out === true,
      status: body.status != null ? String(body.status) : null,
      late_minutes:
        body.late_minutes != null && body.late_minutes !== ""
          ? Number(body.late_minutes)
          : null,
      work_hours:
        body.work_hours != null && body.work_hours !== "" ? Number(body.work_hours) : null,
      is_suspicious:
        typeof body.is_suspicious === "boolean" ? body.is_suspicious : null,
    });

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
