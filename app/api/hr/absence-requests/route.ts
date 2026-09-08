import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
  HrApiError,
} from "@/lib/hr/api-auth";
import {
  serverSubmitAbsenceRequest,
  serverListOwnAbsenceRequests,
  serverListPendingAbsenceForApprover,
  serverListAbsenceForHr,
} from "@/lib/hr/absence-request-server";

/**
 * GET /api/hr/absence-requests
 *   ?mine=1 — own submissions
 *   ?pendingForApprover=1 — scoped approval queue
 *   ?status=pending|approved|rejected|cancelled — HR list (scoped)
 * POST — submit Izin/Off (actor = self)
 */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    const url = new URL(req.url);
    const adminPb = await getInventoryAdminPb();

    if (url.searchParams.get("mine") === "1") {
      const items = await serverListOwnAbsenceRequests(adminPb, ctx);
      return NextResponse.json({ ok: true, items });
    }
    if (url.searchParams.get("pendingForApprover") === "1") {
      const items = await serverListPendingAbsenceForApprover(adminPb, ctx);
      return NextResponse.json({ ok: true, items, total: items.length });
    }
    const status = url.searchParams.get("status") || undefined;
    const items = await serverListAbsenceForHr(adminPb, ctx, status || undefined);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) throw new HrApiError("Login diperlukan.", 401);
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    rejectClientPrivilegeFields(body);
    if (
      body.user != null ||
      body.status != null ||
      body.company != null ||
      body.company_id != null
    ) {
      throw new HrApiError("Field identity/status/company tidak boleh dikirim oleh klien.", 400);
    }
    const adminPb = await getInventoryAdminPb();
    const result = await serverSubmitAbsenceRequest(adminPb, ctx, {
      type: String(body.type ?? "izin"),
      start_date: String(body.start_date ?? ""),
      end_date: String(body.end_date ?? ""),
      reason: String(body.reason ?? ""),
    });
    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: result.id, message: result.message, data: result.data });
  } catch (err) {
    return hrJsonError(err);
  }
}
