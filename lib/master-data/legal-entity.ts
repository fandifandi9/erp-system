/**
 * Phase 34C — System Master Data: Legal Entity (biz_company_profile SSOT).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { isCompanyInScope } from "@/lib/hr/company-scope";
import { assertMasterDataCapability } from "@/lib/master-data/master-data-auth";
import { ENTITY_AUDIT_EVENTS, emitEntityAuditEvent } from "@/lib/master-data/entity-audit";
import { grantEntityAccessToHrUsers } from "@/lib/master-data/membership";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

export const LEGAL_ENTITY_TYPES = [
  "PT",
  "CV",
  "FIRMA",
  "YAYASAN",
  "KOPERASI",
  "NON_PT",
  "OTHER",
] as const;

export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export type LegalEntityRecord = {
  id: string;
  company_name: string;
  legal_name?: string;
  code?: string;
  entity_type?: LegalEntityType | string;
  is_active?: boolean;
  npwp?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  display_name?: string;
  logo?: string;
  updated?: string;
  show_npwp_on_documents?: boolean;
  npwp_display_mode?: string;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function listLegalEntitiesForActor(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  options: { activeOnly?: boolean; assignableOnly?: boolean } = {},
): Promise<LegalEntityRecord[]> {
  assertMasterDataCapability(ctx, "master_data.entity.view");

  const activeOnly = options.activeOnly ?? false;
  const assignableOnly = options.assignableOnly ?? false;

  let filter = "";
  if (ctx.isOwner) {
    if (activeOnly || assignableOnly) filter = "is_active = true";
  } else {
    if (ctx.companyIds.length === 0) return [];
    const or = ctx.companyIds.map((id) => `id = "${pbEscape(id)}"`).join(" || ");
    filter = `(${or})`;
    if (activeOnly || assignableOnly) filter += " && is_active = true";
  }

  const rows = await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getFullList<LegalEntityRecord>({
    filter: filter || undefined,
    sort: "company_name",
    requestKey: null,
  });

  if (ctx.isOwner) return rows;
  return rows.filter((r) => isCompanyInScope(r.id, ctx.companyIds));
}

export async function assertLegalEntityReadableByActor(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
): Promise<void> {
  const list = await listLegalEntitiesForActor(adminPb, ctx, {});
  if (!list.some((e) => e.id === entityId)) {
    throw new HrApiError("Entitas tidak ditemukan atau akses ditolak.", 403);
  }
}

export async function getLegalEntityById(
  adminPb: PocketBase,
  entityId: string,
): Promise<LegalEntityRecord | null> {
  try {
    return (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(entityId, {
      requestKey: null,
    })) as LegalEntityRecord;
  } catch {
    return null;
  }
}

export async function assertEntityAssignable(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
): Promise<LegalEntityRecord> {
  assertMasterDataCapability(ctx, "master_data.membership.assign");
  if (!entityId.trim()) throw new HrApiError("Entitas administratif wajib dipilih.", 400);
  if (!ctx.isOwner && !isCompanyInScope(entityId, ctx.companyIds)) {
    throw new HrApiError("Entitas di luar scope Anda.", 403);
  }
  const entity = await getLegalEntityById(adminPb, entityId);
  if (!entity) throw new HrApiError("Entitas tidak ditemukan.", 404);
  if (entity.is_active === false) {
    throw new HrApiError("Entitas tidak aktif — tidak dapat ditetapkan.", 400);
  }
  return entity;
}

export type CreateLegalEntityInput = {
  company_name: string;
  display_name?: string;
  legal_name?: string;
  code?: string;
  entity_type?: LegalEntityType | string;
  npwp?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  show_npwp_on_documents?: boolean;
  npwp_display_mode?: string;
};

export async function serverCreateLegalEntity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: CreateLegalEntityInput,
): Promise<LegalEntityRecord> {
  assertMasterDataCapability(ctx, "master_data.entity.manage");
  const name = String(input.company_name ?? "").trim();
  if (!name) throw new HrApiError("Nama entitas wajib diisi.", 400);

  const entityType = LEGAL_ENTITY_TYPES.includes(input.entity_type as LegalEntityType)
    ? input.entity_type
    : "PT";

  const legalName = String(input.legal_name ?? "").trim();

  const record = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).create({
    company_name: name,
    legal_name: legalName || undefined,
    code: String(input.code ?? "").trim() || undefined,
    entity_type: entityType,
    is_active: true,
    npwp: input.npwp?.trim() || undefined,
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    website: input.website?.trim() || undefined,
    show_npwp_on_documents: input.show_npwp_on_documents === true,
    npwp_display_mode: input.npwp_display_mode || "footer",
  })) as LegalEntityRecord;

  await grantEntityAccessToHrUsers(adminPb, record.id);

  await emitEntityAuditEvent(adminPb, {
    event_code: ENTITY_AUDIT_EVENTS.CREATED,
    actor_id: ctx.userId,
    entity_id: record.id,
    entity_label: record.company_name,
    company_id: record.id,
    payload: { entity_type: entityType, code: record.code },
    severity: "success",
  });

  return record;
}

export type UpdateLegalEntityInput = Partial<CreateLegalEntityInput> & {
  is_active?: boolean;
};

export async function serverUpdateLegalEntity(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
  input: UpdateLegalEntityInput,
): Promise<LegalEntityRecord> {
  assertMasterDataCapability(ctx, "master_data.entity.manage");
  const before = await getLegalEntityById(adminPb, entityId);
  if (!before) throw new HrApiError("Entitas tidak ditemukan.", 404);

  const patch: Record<string, unknown> = {};
  if (input.company_name != null) patch.company_name = String(input.company_name).trim();
  if (input.legal_name != null) patch.legal_name = String(input.legal_name).trim() || "";
  if (input.display_name != null) patch.display_name = String(input.display_name).trim() || "";
  if (input.code != null) patch.code = String(input.code).trim();
  if (input.entity_type != null && LEGAL_ENTITY_TYPES.includes(input.entity_type as LegalEntityType)) {
    patch.entity_type = input.entity_type;
  }
  if (input.npwp != null) patch.npwp = String(input.npwp).trim();
  if (input.address != null) patch.address = String(input.address).trim();
  if (input.city != null) patch.city = String(input.city).trim();
  if (input.phone != null) patch.phone = String(input.phone).trim();
  if (input.email != null) patch.email = String(input.email).trim();
  if (input.website != null) patch.website = String(input.website).trim();
  if (typeof input.show_npwp_on_documents === "boolean") {
    patch.show_npwp_on_documents = input.show_npwp_on_documents;
  }
  if (input.npwp_display_mode != null) patch.npwp_display_mode = input.npwp_display_mode;
  if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
  patch.updated_by = ctx.userId;

  const record = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).update(
    entityId,
    patch,
  )) as LegalEntityRecord;

  const eventCode =
    typeof input.is_active === "boolean"
      ? input.is_active
        ? ENTITY_AUDIT_EVENTS.ACTIVATED
        : ENTITY_AUDIT_EVENTS.DEACTIVATED
      : ENTITY_AUDIT_EVENTS.UPDATED;

  await emitEntityAuditEvent(adminPb, {
    event_code: eventCode,
    actor_id: ctx.userId,
    entity_id: entityId,
    entity_label: record.company_name,
    company_id: entityId,
    payload: { changed_fields: Object.keys(patch) },
    severity: "info",
  });

  return record;
}
