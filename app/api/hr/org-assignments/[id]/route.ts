import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { endOrgAssignment } from "@/lib/hr/org-assignment-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** PATCH /api/hr/org-assignments/[id] — end assignment (action=end) */
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "end").trim().toLowerCase();
    const adminPb = await getInventoryAdminPb();
    if (action === "end" || action === "deactivate") {
      const record = await endOrgAssignment(adminPb, authCtx, id);
      return NextResponse.json({ ok: true, data: record });
    }
    return NextResponse.json({ ok: false, error: "Aksi tidak didukung." }, { status: 400 });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** DELETE /api/hr/org-assignments/[id] — soft-end */
export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const record = await endOrgAssignment(adminPb, authCtx, id);
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
