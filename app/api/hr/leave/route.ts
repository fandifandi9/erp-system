import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverSubmitLeave, serverListPendingLeaveForApprover, serverListLeaveForHrScope } from "@/lib/hr/leave-server";
import { notifyLeaveCreated } from "@/lib/notifications/dispatch";
import { resolveLeaveApprovers } from "@/lib/notifications/recipients";

/**
 * GET /api/hr/leave?pendingForApprover=1 — scoped pending queue
 * GET /api/hr/leave?forHrMonitor=1 — scoped HR monitor (all statuses, FOM entity scope)
 */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }
    const url = new URL(req.url);
    const adminPb = await getInventoryAdminPb();
    if (url.searchParams.get("forHrMonitor") === "1") {
      const items = await serverListLeaveForHrScope(adminPb, ctx);
      return NextResponse.json({ ok: true, items, total: items.length });
    }
    if (url.searchParams.get("pendingForApprover") === "1") {
      const items = await serverListPendingLeaveForApprover(adminPb, ctx);
      return NextResponse.json({ ok: true, items, total: items.length });
    }
    return NextResponse.json(
      { ok: false, error: "Gunakan pendingForApprover=1 atau forHrMonitor=1." },
      { status: 400 },
    );
  } catch (err) {
    return hrJsonError(err);
  }
}

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

    const response = NextResponse.json({
      ok: true,
      message: result.message,
      data: result.data,
      id: result.id,
    });

    // Fire-and-forget: notify approvers about the new leave request
    if (result.id) {
      const leaveRequestId = result.id;
      const companyIds = ctx.companyIds;
      void (async () => {
        try {
          const approverIds = await resolveLeaveApprovers(adminPb, { companyIds });
          // Exclude requester from approver list (they shouldn't notify themselves)
          const filteredApprovers = approverIds.filter((id) => id !== ctx.userId);
          await notifyLeaveCreated(adminPb, {
            approverIds: filteredApprovers,
            leaveRequestId,
          });
        } catch {
          // Notification failure must never break the main response
        }
      })();
    }

    return response;
  } catch (err) {
    return hrJsonError(err);
  }
}
