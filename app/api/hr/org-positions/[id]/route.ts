import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import {
  deriveApproverForTargetPosition,
  deriveSuperiorFromPosition,
  serverDeleteOrgPosition,
  serverGetOrgPosition,
  serverMoveOrgPosition,
  serverUpdateOrgPosition,
} from "@/lib/hr/org-position-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/hr/org-positions/[id]?approver=1|superior=1 */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const url = new URL(req.url);
    if (url.searchParams.get("approver") === "1") {
      const approver = await deriveApproverForTargetPosition(adminPb, id);
      return NextResponse.json({ ok: true, data: approver });
    }
    if (url.searchParams.get("superior") === "1") {
      const superior = await deriveSuperiorFromPosition(adminPb, id);
      return NextResponse.json({ ok: true, data: superior });
    }
    const record = await serverGetOrgPosition(adminPb, id);
    if (!record) return NextResponse.json({ ok: false, error: "Jabatan tidak ditemukan." }, { status: 404 });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** PATCH /api/hr/org-positions/[id] — metadata / holder; action=move for parent change */
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();

    const action = String(body.action ?? "").trim().toLowerCase();
    if (action === "move") {
      const rawParent =
        body.newParentPositionId !== undefined
          ? body.newParentPositionId
          : body.parentPositionId !== undefined
            ? body.parentPositionId
            : body.parent_position_id;
      const record = await serverMoveOrgPosition(adminPb, authCtx, id, {
        newParentPositionId:
          rawParent === null || rawParent === ""
            ? null
            : String(rawParent ?? ""),
      });
      return NextResponse.json({ ok: true, data: record });
    }

    const record = await serverUpdateOrgPosition(adminPb, authCtx, id, {
      name: body.name != null ? String(body.name) : undefined,
      code: body.code != null ? String(body.code) : undefined,
      department: body.department != null ? String(body.department) : undefined,
      division: body.division != null ? String(body.division) : undefined,
      parentPositionId:
        body.parentPositionId !== undefined
          ? body.parentPositionId == null
            ? null
            : String(body.parentPositionId)
          : body.parent_position_id !== undefined
            ? body.parent_position_id == null
              ? null
              : String(body.parent_position_id)
            : undefined,
      holderUserId:
        body.holderUserId !== undefined
          ? body.holderUserId == null
            ? null
            : String(body.holderUserId)
          : body.holder_user_id !== undefined
            ? body.holder_user_id == null
              ? null
              : String(body.holder_user_id)
            : undefined,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      workspaceDomain:
        body.workspaceDomain !== undefined
          ? body.workspaceDomain == null
            ? null
            : String(body.workspaceDomain)
          : body.workspace_domain !== undefined
            ? body.workspace_domain == null
              ? null
              : String(body.workspace_domain)
            : undefined,
      orgLevelLabel:
        body.orgLevelLabel !== undefined
          ? body.orgLevelLabel == null
            ? null
            : String(body.orgLevelLabel)
          : body.org_level_label !== undefined
            ? body.org_level_label == null
              ? null
              : String(body.org_level_label)
            : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** DELETE /api/hr/org-positions/[id] — Owner only */
export async function DELETE(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    await serverDeleteOrgPosition(adminPb, authCtx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
