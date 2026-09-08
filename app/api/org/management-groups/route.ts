import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import {
  createManagementGroup,
  listManagementGroups,
  setManagementGroupEntities,
} from "@/lib/org/management-group-server";

/** GET /api/org/management-groups — Owner only */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    if (!ctx.isOwner) {
      return NextResponse.json({ ok: false, error: "Hanya Owner/Super Admin." }, { status: 403 });
    }
    const adminPb = await getInventoryAdminPb();
    const items = await listManagementGroups(adminPb);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/org/management-groups */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    if (!ctx.isOwner) {
      return NextResponse.json({ ok: false, error: "Hanya Owner/Super Admin." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();

    if (body.action === "setEntities") {
      const record = await setManagementGroupEntities(
        adminPb,
        ctx,
        String(body.managementGroupId ?? body.id ?? ""),
        Array.isArray(body.entityIds) ? body.entityIds.map((x) => String(x)) : [],
      );
      return NextResponse.json({ ok: true, data: record });
    }

    const record = await createManagementGroup(adminPb, ctx, {
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      notes: body.notes != null ? String(body.notes) : undefined,
      entityIds: Array.isArray(body.entityIds) ? body.entityIds.map((x) => String(x)) : [],
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
