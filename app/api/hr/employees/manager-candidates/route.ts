import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  HrApiError,
  hrJsonError,
  requireAuthenticatedHrUser,
} from "@/lib/hr/api-auth";
import { assertEmployeeCapability } from "@/lib/hr/employee-auth";
import { listManagerCandidates } from "@/lib/hr/manager-hierarchy";
import { getHrEffectiveCompanyIds } from "@/lib/access/hr-api-enforcement";

/** GET /api/hr/employees/manager-candidates?exclude=USER_ID */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    assertEmployeeCapability(ctx, "employee.assign_manager");

    const url = new URL(req.url);
    const exclude = url.searchParams.get("exclude")?.trim() || undefined;
    const companyId = url.searchParams.get("company_id")?.trim() || undefined;

    // Phase 35I-K-P1: authorized = membership ∩ module (never raw membership-only leak).
    const effective = getHrEffectiveCompanyIds(ctx);
    if (companyId) {
      if (!ctx.isOwner && !effective.includes(companyId)) {
        throw new HrApiError("Entitas di luar scope HR Anda.", 403);
      }
    }

    const forPosition = url.searchParams.get("for_position")?.trim() || undefined;
    const noMerangkap = url.searchParams.get("no_merangkap") === "1" || Boolean(forPosition);

    const adminPb = await getInventoryAdminPb();
    const scopeCompanyIds = companyId
      ? [companyId]
      : effective.length > 0
        ? effective
        : null;
    const candidates = await listManagerCandidates(adminPb, {
      excludeUserId: exclude,
      companyIds: scopeCompanyIds,
      excludeActiveOrgHolders: noMerangkap,
      allowHolderOfPositionId: forPosition || null,
    });

    return NextResponse.json({ ok: true, data: candidates });
  } catch (err) {
    return hrJsonError(err);
  }
}
