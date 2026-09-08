import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { buildEmployeeAccessPreview } from "@/lib/hr/employee-mutation-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/hr/employees/[id]/access-preview — read-only capability matrix (no impersonation). */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireAuthenticatedHrUser(req);
    const { id: userId } = await ctx.params;

    const adminPb = await getInventoryAdminPb();
    const preview = await buildEmployeeAccessPreview(adminPb, authCtx, userId);

    return NextResponse.json({ ok: true, data: preview });
  } catch (err) {
    return hrJsonError(err);
  }
}
