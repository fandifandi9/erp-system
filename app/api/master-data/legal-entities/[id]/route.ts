import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerApiUser } from "@/lib/hr/api-auth";
import { serverUpdateLegalEntity } from "@/lib/master-data/legal-entity";

type RouteCtx = { params: Promise<{ id: string }> };

/** PATCH /api/master-data/legal-entities/[id] — Owner only. */
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerApiUser(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const adminPb = await getInventoryAdminPb();
    const record = await serverUpdateLegalEntity(adminPb, authCtx, id, {
      company_name: body.company_name != null ? String(body.company_name) : undefined,
      display_name: body.display_name != null ? String(body.display_name) : undefined,
      legal_name: body.legal_name != null ? String(body.legal_name) : undefined,
      code: body.code != null ? String(body.code) : undefined,
      entity_type: body.entity_type != null ? String(body.entity_type) : undefined,
      npwp: body.npwp != null ? String(body.npwp) : undefined,
      address: body.address != null ? String(body.address) : undefined,
      city: body.city != null ? String(body.city) : undefined,
      phone: body.phone != null ? String(body.phone) : undefined,
      email: body.email != null ? String(body.email) : undefined,
      website: body.website != null ? String(body.website) : undefined,
      show_npwp_on_documents:
        typeof body.show_npwp_on_documents === "boolean" ? body.show_npwp_on_documents : undefined,
      npwp_display_mode:
        body.npwp_display_mode != null ? String(body.npwp_display_mode) : undefined,
      is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
    });

    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
