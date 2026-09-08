import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import { serverApproveLeave } from "@/lib/hr/leave-server";
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

    const adminPb = await getInventoryAdminPb();
    const result = await serverApproveLeave(adminPb, auth, id.trim());

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.message, message: result.message },
        { status: 400 },
      );
    }

    const response = NextResponse.json({ ok: true, message: result.message, id: result.id });

    // Fire-and-forget: notify requester of approval
    if (result.id) {
      const leaveRequestId = result.id;
      void (async () => {
        try {
          // Fetch the leave request to get the requester user ID
          const record = await adminPb
            .collection("leave_requests")
            .getOne(leaveRequestId, { requestKey: null }) as { user: string };
          if (record.user && record.user !== auth.userId) {
            await notifyLeaveDecision(adminPb, {
              requesterId: record.user,
              leaveRequestId,
              decision: "approved",
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

/** Guard: GET not used — keep unauthenticated probe quiet */
export async function GET(req: Request) {
  const ctx = await getAuthenticatedHrUser(req);
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
  }
  return NextResponse.json({ ok: false, error: "Gunakan POST untuk approve." }, { status: 405 });
}
