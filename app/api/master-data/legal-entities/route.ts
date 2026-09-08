import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser, requireOwnerApiUser } from "@/lib/hr/api-auth";
import { listLegalEntitiesForActor, serverCreateLegalEntity, type LegalEntityRecord } from "@/lib/master-data/legal-entity";

/** GET /api/master-data/legal-entities — scoped list (HR read-only, Owner all). */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("activeOnly") === "true";
    const assignableOnly = url.searchParams.get("assignableOnly") === "true";

    const adminPb = await getInventoryAdminPb();
    const items = await listLegalEntitiesForActor(adminPb, ctx, {
      activeOnly: activeOnly || assignableOnly,
      assignableOnly,
    });

    return NextResponse.json({
      ok: true,
      data: items.map((e) => {
        const logo = String((e as LegalEntityRecord).logo ?? "").trim();
        return {
          id: e.id,
          company_name: e.company_name,
          legal_name: e.legal_name,
          code: e.code,
          entity_type: e.entity_type,
          is_active: e.is_active !== false,
          logo: logo || undefined,
          logo_url: logo ? `/api/master-data/legal-entities/${e.id}/logo` : undefined,
        };
      }),
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/master-data/legal-entities — Owner only. */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const adminPb = await getInventoryAdminPb();
    const record = await serverCreateLegalEntity(adminPb, ctx, {
      company_name: String(body.company_name ?? ""),
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
    });

    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
