import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import {
  createOrgAssignment,
  getActiveOrgAssignment,
  listActiveOrgAssignments,
} from "@/lib/hr/org-assignment-server";
import { getHrWorkingCompanyIds } from "@/lib/access/hr-api-enforcement";

/** GET /api/hr/org-assignments?userId=&companyId= */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const url = new URL(req.url);
    const userId = String(url.searchParams.get("userId") || "").trim();
    const companyId = String(url.searchParams.get("companyId") || "").trim();
    const adminPb = await getInventoryAdminPb();

    if (userId && companyId) {
      const one = await getActiveOrgAssignment(adminPb, userId, companyId);
      return NextResponse.json({ ok: true, data: one });
    }
    if (userId) {
      const items = await listActiveOrgAssignments(adminPb, userId);
      return NextResponse.json({ ok: true, items });
    }

    // Default: working-company context for current user is not a directory dump
    const working = getHrWorkingCompanyIds(ctx);
    return NextResponse.json({
      ok: true,
      workingCompanyIds: working,
      items: [],
      hint: "Provide userId (and optional companyId).",
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/org-assignments */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const record = await createOrgAssignment(adminPb, ctx, {
      userId: String(body.userId ?? body.user_id ?? ""),
      companyId: String(body.companyId ?? body.company_id ?? ""),
      orgPositionId: String(body.orgPositionId ?? body.org_position_id ?? ""),
      effectiveFrom: body.effectiveFrom != null ? String(body.effectiveFrom) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
