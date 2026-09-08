/**
 * Phase 34G — Entity Identity SSOT (biz_company_profile).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { fetchPrimaryAdministrativeEntityForUser } from "@/lib/hr/profile-primary-entity";
import { buildEntityLogoUrl } from "@/lib/hr/entity-logo-server";
import { assertLegalEntityReadableByActor } from "@/lib/master-data/legal-entity";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

import type { EntityIdentityView } from "@/lib/hr/entity-identity-types";

function mapEntityIdentity(rec: Record<string, unknown>): EntityIdentityView {
  const id = String(rec.id ?? "");
  const companyName = String(rec.company_name ?? "").trim();
  const legalName = String(rec.legal_name ?? "").trim() || companyName;
  const displayName = String(rec.display_name ?? "").trim() || companyName;
  const logo = String(rec.logo ?? "").trim() || undefined;
  const updated = String(rec.updated ?? "").trim() || undefined;
  return {
    entity_id: id,
    legal_name: legalName,
    display_name: displayName,
    company_name: companyName,
    code: String(rec.code ?? "").trim() || undefined,
    entity_type: String(rec.entity_type ?? "").trim() || undefined,
    address: String(rec.address ?? "").trim() || undefined,
    city: String(rec.city ?? "").trim() || undefined,
    phone: String(rec.phone ?? "").trim() || undefined,
    email: String(rec.email ?? "").trim() || undefined,
    website: String(rec.website ?? "").trim() || undefined,
    tax_identifier: String(rec.npwp ?? "").trim() || undefined,
    logo,
    logo_url: logo ? `/api/master-data/legal-entities/${id}/logo${updated ? `?v=${encodeURIComponent(updated)}` : ""}` : null,
    updated_at: updated,
  };
}

export async function getEntityIdentityById(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
): Promise<EntityIdentityView> {
  await assertLegalEntityReadableByActor(adminPb, ctx, entityId);
  const rec = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(entityId, {
    requestKey: null,
  })) as Record<string, unknown>;
  return mapEntityIdentity(rec);
}

/** Primary entity identity for authenticated user (staff attendance, profile context). */
export async function getEntityIdentityForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<EntityIdentityView | null> {
  const primary = await fetchPrimaryAdministrativeEntityForUser(adminPb, userId);
  if (primary.status !== "resolved" || !primary.company_id) return null;
  try {
    const rec = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(primary.company_id, {
      requestKey: null,
    })) as Record<string, unknown>;
    return mapEntityIdentity(rec);
  } catch {
    return null;
  }
}
