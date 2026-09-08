import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverSetEmployeeStatus } from "@/lib/hr/employee-mutation-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** POST /api/hr/employees/[id]/activate */
export async function POST(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireAuthenticatedHrUser(req);
    const { id: userId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);

    const adminPb = await getInventoryAdminPb();
    await serverSetEmployeeStatus(
      adminPb,
      authCtx,
      userId,
      "active",
      body.reason != null ? String(body.reason) : undefined,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
