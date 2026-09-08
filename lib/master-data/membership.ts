/**
 * Phase 34C — Employee ↔ Legal Entity membership (biz_user_companies).
 */

import type PocketBase from "pocketbase";
import { isHrAccount, isOwnerAccount } from "@/lib/auth-model";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { USER_COMPANIES_COLLECTION } from "@/lib/tenant/company-access";
import { assertEntityAssignable } from "@/lib/master-data/legal-entity";
import { assertMasterDataCapability } from "@/lib/master-data/master-data-auth";
import { ENTITY_AUDIT_EVENTS, emitEntityAuditEvent } from "@/lib/master-data/entity-audit";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type EmployeeMembershipRow = {
  id: string;
  company: string;
  is_active?: boolean;
  is_primary?: boolean;
  expand?: {
    company?: {
      id: string;
      company_name?: string;
      code?: string;
      entity_type?: string;
      is_active?: boolean;
    };
  };
};

/** Beri akses entitas baru ke semua akun HR aktif (scope onboarding / entitas administratif). */
export async function grantEntityAccessToHrUsers(
  adminPb: PocketBase,
  companyId: string,
): Promise<number> {
  if (!companyId.trim()) return 0;

  const [users, existingRows] = await Promise.all([
    adminPb.collection("users").getFullList<Record<string, unknown>>({
      filter: 'status != "inactive"',
      fields: "id,role,role_code,account_type,status",
      requestKey: null,
    }),
    adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{ user: string; company: string }>({
      filter: `company = "${pbEscape(companyId)}" && is_active != false`,
      fields: "user,company",
      requestKey: null,
    }),
  ]);

  const existingUsers = new Set(existingRows.map((r) => r.user));
  let granted = 0;

  for (const user of users) {
    if (!isHrAccount(user) || isOwnerAccount(user)) continue;
    const userId = String(user.id ?? "");
    if (!userId || existingUsers.has(userId)) continue;

    await adminPb.collection(USER_COMPANIES_COLLECTION).create({
      user: userId,
      company: companyId,
      is_active: true,
      is_primary: false,
    });
    granted++;
  }

  return granted;
}

export async function listEmployeeMemberships(
  adminPb: PocketBase,
  userId: string,
): Promise<EmployeeMembershipRow[]> {
  try {
    return (await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<EmployeeMembershipRow>({
      filter: `user = "${pbEscape(userId)}" && is_active != false`,
      expand: "company",
      sort: "-is_primary,created",
      requestKey: null,
    })) as EmployeeMembershipRow[];
  } catch {
    return [];
  }
}

export async function resolvePrimaryCompanyId(
  adminPb: PocketBase,
  userId: string,
): Promise<string | null> {
  const rows = await listEmployeeMemberships(adminPb, userId);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!.company;
  const primary = rows.find((r) => r.is_primary === true);
  return primary?.company || null;
}

async function syncUserDefaultCompany(
  adminPb: PocketBase,
  userId: string,
  primaryCompanyId: string,
): Promise<void> {
  const user = (await adminPb.collection("users").getOne(userId, {
    fields: "id,default_company,active_company",
    requestKey: null,
  })) as { default_company?: string; active_company?: string };

  const patch: Record<string, string> = { default_company: primaryCompanyId };
  const active = user.active_company;
  if (!active || active !== primaryCompanyId) {
    patch.active_company = primaryCompanyId;
  }
  await adminPb.collection("users").update(userId, patch);
}

/**
 * Resolve primary entity for employee create.
 * - Actor scope empty → fail closed
 * - Client id provided → validate scope + active
 * - Single scope entity → auto-select
 * - Multiple → client id required
 */
export async function resolvePrimaryEntityForEmployeeCreate(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  clientPrimaryEntityId?: string | null,
): Promise<string> {
  assertMasterDataCapability(ctx, "master_data.membership.assign");

  if (ctx.isOwner) {
    const active = await adminPb.collection("biz_company_profile").getFullList<{ id: string }>({
      filter: "is_active = true",
      sort: "company_name",
      fields: "id",
      requestKey: null,
    });
    const ids = active.map((r) => r.id);
    if (ids.length === 0) throw new HrApiError("Belum ada entitas administratif aktif.", 400);
    if (clientPrimaryEntityId?.trim()) {
      await assertEntityAssignable(adminPb, ctx, clientPrimaryEntityId.trim());
      return clientPrimaryEntityId.trim();
    }
    if (ids.length === 1) return ids[0]!;
    throw new HrApiError("Pilih entitas administratif untuk karyawan baru.", 400);
  }

  if (ctx.companyIds.length === 0) {
    throw new HrApiError("Scope entitas HR kosong — tidak dapat membuat karyawan.", 403);
  }

  if (clientPrimaryEntityId?.trim()) {
    await assertEntityAssignable(adminPb, ctx, clientPrimaryEntityId.trim());
    return clientPrimaryEntityId.trim();
  }

  if (ctx.companyIds.length === 1) {
    await assertEntityAssignable(adminPb, ctx, ctx.companyIds[0]!);
    return ctx.companyIds[0]!;
  }

  throw new HrApiError("Pilih entitas administratif untuk karyawan baru.", 400);
}

export async function assignEmployeeMembership(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  userId: string,
  input: { primaryEntityId: string; additionalEntityIds?: string[] },
  auditTargetLabel?: string,
): Promise<void> {
  assertMasterDataCapability(ctx, "master_data.membership.assign");

  const primary = input.primaryEntityId.trim();
  await assertEntityAssignable(adminPb, ctx, primary);

  const additional = [...new Set((input.additionalEntityIds || []).filter((id) => id && id !== primary))];
  for (const id of additional) {
    await assertEntityAssignable(adminPb, ctx, id);
  }

  const targetSet = new Set([primary, ...additional]);
  const before = await listEmployeeMemberships(adminPb, userId);
  const beforePrimary = before.find((r) => r.is_primary)?.company || null;

  const existing = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{
    id: string;
    company: string;
    is_active?: boolean;
  }>({
    filter: `user = "${pbEscape(userId)}"`,
    requestKey: null,
  });

  const existingByCompany = new Map(existing.map((r) => [r.company, r]));

  for (const cid of targetSet) {
    const row = existingByCompany.get(cid);
    const isPrimary = cid === primary;
    if (row) {
      await adminPb.collection(USER_COMPANIES_COLLECTION).update(row.id, {
        is_active: true,
        is_primary: isPrimary,
      });
    } else {
      await adminPb.collection(USER_COMPANIES_COLLECTION).create({
        user: userId,
        company: cid,
        is_active: true,
        is_primary: isPrimary,
      });
      await emitEntityAuditEvent(adminPb, {
        event_code: ENTITY_AUDIT_EVENTS.ASSIGNED,
        actor_id: ctx.userId,
        entity_id: userId,
        entity_label: auditTargetLabel || userId,
        company_id: cid,
        payload: { target_user_id: userId, company_id: cid, is_primary: isPrimary },
      });
    }
  }

  for (const row of existing) {
    if (!targetSet.has(row.company)) {
      await adminPb.collection(USER_COMPANIES_COLLECTION).delete(row.id);
      await emitEntityAuditEvent(adminPb, {
        event_code: ENTITY_AUDIT_EVENTS.REMOVED,
        actor_id: ctx.userId,
        entity_id: userId,
        entity_label: auditTargetLabel || userId,
        company_id: row.company,
        payload: { target_user_id: userId, company_id: row.company },
      });
    } else if (row.company !== primary) {
      await adminPb.collection(USER_COMPANIES_COLLECTION).update(row.id, { is_primary: false });
    }
  }

  await syncUserDefaultCompany(adminPb, userId, primary);

  if (beforePrimary !== primary) {
    await emitEntityAuditEvent(adminPb, {
      event_code: ENTITY_AUDIT_EVENTS.PRIMARY_CHANGED,
      actor_id: ctx.userId,
      entity_id: userId,
      entity_label: auditTargetLabel || userId,
      company_id: primary,
      payload: {
        target_user_id: userId,
        before_company_id: beforePrimary,
        after_company_id: primary,
      },
      severity: "info",
    });
  }
}

/**
 * Additive: pastikan user punya keanggotaan aktif di company (tanpa menghapus membership lain).
 * Dipakai saat penempatan jabatan organisasi agar daftar karyawan entitas tetap sinkron.
 */
export async function ensureActiveCompanyMembership(
  adminPb: PocketBase,
  userId: string,
  companyId: string,
): Promise<void> {
  const uid = userId.trim();
  const cid = companyId.trim();
  if (!uid || !cid) return;

  const existing = await adminPb.collection(USER_COMPANIES_COLLECTION).getFullList<{
    id: string;
    company: string;
    is_active?: boolean;
    is_primary?: boolean;
  }>({
    filter: `user = "${pbEscape(uid)}"`,
    requestKey: null,
  });

  const row = existing.find((r) => r.company === cid);
  if (row) {
    if (row.is_active === false) {
      await adminPb.collection(USER_COMPANIES_COLLECTION).update(row.id, { is_active: true }, {
        requestKey: null,
      });
    }
    return;
  }

  const hasActivePrimary = existing.some((r) => r.is_active !== false && r.is_primary === true);
  await adminPb.collection(USER_COMPANIES_COLLECTION).create(
    {
      user: uid,
      company: cid,
      is_active: true,
      is_primary: !hasActivePrimary,
    },
    { requestKey: null },
  );
}
