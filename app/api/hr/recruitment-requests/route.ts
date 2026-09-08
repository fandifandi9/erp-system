import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverListPendingRecruitmentForApprover } from "@/lib/hr/recruitment-request-server";

/** GET /api/hr/recruitment-requests?pendingForApprover=1 — Meja Kerja queue */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const url = new URL(req.url);
    const forApprover = url.searchParams.get("pendingForApprover") === "1";
    if (!forApprover) {
      return NextResponse.json(
        { ok: false, error: "Gunakan pendingForApprover=1." },
        { status: 400 },
      );
    }
    const adminPb = await getInventoryAdminPb();
    const items = await serverListPendingRecruitmentForApprover(adminPb, ctx);
    return NextResponse.json({ ok: true, items, total: items.length });
  } catch (err) {
    return hrJsonError(err);
  }
}
