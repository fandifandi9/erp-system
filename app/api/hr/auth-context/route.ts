import { NextResponse } from "next/server";
import {
  getAuthenticatedHrUser,
  hrJsonError,
  rejectClientPrivilegeFields,
} from "@/lib/hr/api-auth";

/**
 * Wave 1 foundation endpoint — returns the caller's validated auth + company scope.
 * Does not expose salary / NIK / payroll. Not a mutation API.
 *
 * POST body privilege fields (if any) are rejected to prove the contract helper.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      userId: ctx.userId,
      accountType: ctx.auth.accountType,
      roleCode: ctx.auth.roleCode,
      isOwner: ctx.isOwner,
      isHr: ctx.isHr,
      companyIds: ctx.companyIds,
      companyCount: ctx.companyIds.length,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** Contract probe: privilege fields in body must be rejected (400). Auth still required. */
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

    return NextResponse.json({
      ok: true,
      message: "Privilege fields absent or allowed empty body.",
      userId: ctx.userId,
      isOwner: ctx.isOwner,
      isHr: ctx.isHr,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}
