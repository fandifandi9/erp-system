import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverRejectLeave } from "@/lib/hr/leave-server";
import { notifyLeaveDecision } from "@/lib/notifications/dispatch";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      throw new HrApiError("ID pengajuan wajib.", 400);
    }

    const auth = await getAuthenticatedHrUser(req);
    if (!auth) throw new HrApiError("Login diperlukan.", 401);

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);

    const reason = String(body.reason ?? body.rejection_reason ?? "");

    const adminPb = await getInventoryAdminPb();
    const result = await serverRejectLeave(adminPb, auth, id.trim(), reason);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.message, message: result.message },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ ok: true, message: result.message, id: result.id });

    // Fire-and-forget: notify requester of rejection
    if (result.id) {
      const leaveRequestId = result.id;
      void (async () => {
        try {
          const record = await adminPb
            .collection("leave_requests")
            .getOne(leaveRequestId, { requestKey: null }) as { user: string };
          if (record.user && record.user !== auth.userId) {
            await notifyLeaveDecision(adminPb, {
              requesterId: record.user,
              leaveRequestId,
              decision: "rejected",
            });
          }
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
