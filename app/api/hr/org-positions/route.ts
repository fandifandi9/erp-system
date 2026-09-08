import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { buildOrgStructureActorCapabilities } from "@/lib/hr/org-authority";
import {
  buildOrgPositionTree,
  serverCreateOrgPosition,
  serverListOrgPositions,
  serverResetAllOrgPositions,
} from "@/lib/hr/org-position-server";

/** GET /api/hr/org-positions?companyId=&tree=1 */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const asTree = url.searchParams.get("tree") === "1";
    const adminPb = await getInventoryAdminPb();
    const items = await serverListOrgPositions(adminPb, ctx, companyId);
    const caps = buildOrgStructureActorCapabilities(ctx, items);
    const actorCapabilities = {
      canChangeMode: caps.canChangeMode,
      canCreateRoot: caps.canCreateRoot,
      canResetStructure: caps.canResetStructure,
      canDeletePosition: caps.canDeletePosition,
      heldPositionIds: caps.heldPositionIds,
      managedPositionIds: caps.managedPositionIds,
    };
    if (asTree) {
      return NextResponse.json({
        ok: true,
        tree: buildOrgPositionTree(items),
        items,
        actorCapabilities,
      });
    }
    return NextResponse.json({ ok: true, items, actorCapabilities });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/org-positions */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const record = await serverCreateOrgPosition(adminPb, ctx, {
      companyId: String(body.companyId ?? body.company_id ?? ""),
      name: String(body.name ?? ""),
      code: body.code != null ? String(body.code) : undefined,
      department: body.department != null ? String(body.department) : undefined,
      division: body.division != null ? String(body.division) : undefined,
      parentPositionId:
        body.parentPositionId != null
          ? String(body.parentPositionId)
          : body.parent_position_id != null
            ? String(body.parent_position_id)
            : null,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      notes: body.notes != null ? String(body.notes) : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      scopeType:
        body.scopeType != null
          ? String(body.scopeType)
          : body.scope_type != null
            ? String(body.scope_type)
            : undefined,
      scopeCompanyIds: Array.isArray(body.scopeCompanyIds)
        ? (body.scopeCompanyIds as unknown[]).map((x) => String(x))
        : Array.isArray(body.scope_company_ids)
          ? (body.scope_company_ids as unknown[]).map((x) => String(x))
          : undefined,
      workspaceDomain:
        body.workspaceDomain != null
          ? String(body.workspaceDomain)
          : body.workspace_domain != null
            ? String(body.workspace_domain)
            : undefined,
      orgLevelLabel:
        body.orgLevelLabel != null
          ? String(body.orgLevelLabel)
          : body.org_level_label != null
            ? String(body.org_level_label)
            : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}

/**
 * DELETE /api/hr/org-positions?reset=1
 * Owner-only: kosongkan seluruh struktur agar mode dapat diubah.
 */
export async function DELETE(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const url = new URL(req.url);
    if (url.searchParams.get("reset") !== "1") {
      return NextResponse.json(
        { ok: false, error: "Gunakan ?reset=1 untuk mengosongkan seluruh struktur (Owner)." },
        { status: 400 },
      );
    }
    const adminPb = await getInventoryAdminPb();
    const result = await serverResetAllOrgPositions(adminPb, ctx);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return hrJsonError(err);
  }
}
