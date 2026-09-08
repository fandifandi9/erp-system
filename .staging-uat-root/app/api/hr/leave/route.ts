import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverSubmitLeave } from "@/lib/hr/leave-server";

/**
 * POST /api/hr/leave — submit leave (authenticated employee → pending).
 * Identity/status/hr_action_* never taken from body.
 */
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

    // Forge attempts: client cannot assign another user / force status
    if (
      body.user != null ||
      body.userId != null ||
      body.user_id != null ||
      body.status != null ||
      body.company_id != null ||
      body.company != null
    ) {
      throw new HrApiError(
        "Field identity/status/company tidak boleh dikirim oleh klien.",
        400,
      );
    }

    const adminPb = await getInventoryAdminPb();
    const result = await serverSubmitLeave(adminPb, ctx, {
      start_date: String(body.start_date ?? ""),
      end_date: String(body.end_date ?? ""),
      reason: body.reason != null ? String(body.reason) : undefined,
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
