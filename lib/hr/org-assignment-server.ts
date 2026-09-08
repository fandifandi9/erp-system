/**
 * Phase 35I-F3 — Employee org assignment SSOT server (admin PB).
 */

import type PocketBase from "pocketbase";
import {
  getHrEffectiveCompanyIds,
  getHrWorkingCompanyIds,
  isHrOperationalActor,
} from "@/lib/access/hr-api-enforcement";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION,
  type OrgAssignmentRecord,
  parseScopeCompanyIds,
  parseScopeType,
} from "@/lib/hr/org-assignment-types";
import {
  companyInPositionScope,
  effectivePositionCompanyIds,
  isChildScopeSubsetOfParent,
  isGroupWideScope,
} from "@/lib/hr/org-position-scope";
import {
  HR_ORG_POSITIONS_COLLECTION,
  type DerivedApprover,
  type DerivedSuperior,
  type OrgPositionRecord,
} from "@/lib/hr/org-position-types";
import { serverGetOrgPosition } from "@/lib/hr/org-position-server";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function relationId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = String((raw as { id: unknown }).id ?? "").trim();
    return id || null;
  }
  return null;
}

function mapAssignment(rec: Record<string, unknown>): OrgAssignmentRecord {
  return {
    id: String(rec.id ?? ""),
    userId: relationId(rec.user) || "",
    companyId: relationId(rec.company) || "",
    orgPositionId: relationId(rec.org_position) || "",
    isActive: rec.is_active === true,
    status: String(rec.status ?? "").trim() || (rec.is_active === true ? "active" : "ended"),
    effectiveFrom: rec.effective_from ? String(rec.effective_from).slice(0, 10) : null,
    effectiveTo: rec.effective_to ? String(rec.effective_to).slice(0, 10) : null,
    createdBy: rec.created_by != null ? String(rec.created_by) : null,
    updatedBy: rec.updated_by != null ? String(rec.updated_by) : null,
    notes: String(rec.notes ?? "").trim() || undefined,
  };
}

function assertCompanyAuthorized(ctx: HrApiAuthContext, companyId: string): void {
  const id = companyId.trim();
  if (!id) throw new HrApiError("Entitas wajib.", 400);
  const allowed = getHrEffectiveCompanyIds(ctx);
  if (!allowed.includes(id)) {
    throw new HrApiError("Entitas di luar scope HR Anda.", 403);
  }
}

export async function getActiveOrgAssignment(
  adminPb: PocketBase,
  userId: string,
  companyId: string,
): Promise<OrgAssignmentRecord | null> {
  const uid = userId.trim();
  const cid = companyId.trim();
  if (!uid || !cid) return null;
  const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
    filter: `user = "${pbEscape(uid)}" && company = "${pbEscape(cid)}" && is_active = true`,
    sort: "-created",
    requestKey: null,
  });
  if (!rows[0]) return null;
  return mapAssignment(rows[0] as unknown as Record<string, unknown>);
}

export async function listActiveOrgAssignments(
  adminPb: PocketBase,
  userId: string,
): Promise<OrgAssignmentRecord[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
    filter: `user = "${pbEscape(uid)}" && is_active = true`,
    sort: "company",
    requestKey: null,
  });
  return rows.map((r) => mapAssignment(r as unknown as Record<string, unknown>));
}

export async function getPositionHolderFromAssignment(
  adminPb: PocketBase,
  positionId: string,
): Promise<{ userId: string; assignmentId: string; companyId: string } | null> {
  const list = await listActiveHoldersForPosition(adminPb, positionId);
  return list[0] ?? null;
}

/** Phase 35I-I — all active holders on a position (multi-holder). */
export async function listActiveHoldersForPosition(
  adminPb: PocketBase,
  positionId: string,
): Promise<Array<{ userId: string; assignmentId: string; companyId: string }>> {
  const pid = positionId.trim();
  if (!pid) return [];
  const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
    filter: `org_position = "${pbEscape(pid)}" && is_active = true`,
    sort: "created",
    requestKey: null,
  });
  const out: Array<{ userId: string; assignmentId: string; companyId: string }> = [];
  for (const raw of rows) {
    const mapped = mapAssignment(raw as unknown as Record<string, unknown>);
    if (!mapped.userId) continue;
    out.push({ userId: mapped.userId, assignmentId: mapped.id, companyId: mapped.companyId });
  }
  return out;
}

async function syncHolderCache(
  adminPb: PocketBase,
  positionId: string,
  holderUserId: string | null,
): Promise<void> {
  try {
    // Compatibility mirror: store first holder or null (SSOT remains assignments).
    await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).update(
      positionId,
      { holder_user: holderUserId || null },
      { requestKey: null },
    );
  } catch {
    /* cache soft-fail */
  }
}

async function mirrorProfileOrgPosition(
  adminPb: PocketBase,
  userId: string,
  position: OrgPositionRecord | null,
  superiorUserId: string | null,
): Promise<void> {
  try {
    const profiles = await adminPb.collection("profiles").getFullList({
      filter: `user = "${pbEscape(userId)}"`,
      requestKey: null,
    });
    const profile = profiles[0] as { id: string } | undefined;
    if (!profile) return;
    await adminPb.collection("profiles").update(
      profile.id,
      {
        org_position_id: position?.id ?? "",
        ...(position ? { position: position.name } : {}),
        manager: superiorUserId || null,
      },
      { requestKey: null },
    );
  } catch {
    /* soft-fail */
  }
}

async function countActiveForUser(
  adminPb: PocketBase,
  userId: string,
  excludeId?: string,
): Promise<number> {
  const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
    filter: `user = "${pbEscape(userId)}" && is_active = true`,
    requestKey: null,
  });
  return rows.filter((r) => !excludeId || String(r.id) !== excludeId).length;
}

async function countActiveForPosition(
  adminPb: PocketBase,
  positionId: string,
  excludeId?: string,
): Promise<number> {
  const rows = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
    filter: `org_position = "${pbEscape(positionId)}" && is_active = true`,
    requestKey: null,
  });
  return rows.filter((r) => !excludeId || String(r.id) !== excludeId).length;
}

export async function validatePositionScopeAgainstParent(
  adminPb: PocketBase,
  child: OrgPositionRecord,
  parent: OrgPositionRecord | null,
  authorizedCompanyIds: readonly string[],
): Promise<void> {
  if (!parent) return;
  const parentEff = effectivePositionCompanyIds(parent, authorizedCompanyIds);
  const childEff = effectivePositionCompanyIds(child, authorizedCompanyIds);
  const parentWide = isGroupWideScope(parent.scopeType);
  if (!isChildScopeSubsetOfParent(childEff, parentEff, parentWide)) {
    throw new HrApiError(
      "Scope company child harus subset dari scope parent (mencegah authority leakage).",
      400,
      "ORG_SCOPE_CHILD_NOT_SUBSET",
    );
  }
}

export type CreateOrgAssignmentInput = {
  userId: string;
  companyId: string;
  orgPositionId: string;
  effectiveFrom?: string | null;
  notes?: string;
};

/**
 * Create active assignment.
 * Phase 35I-G: ONE active company + ONE active position per user at a time.
 * Phase 35I-I: ONE position may have MANY active holders (no single-seat lock).
 * Race mitigation: create then re-count user actives; roll back extras.
 */
export async function createOrgAssignment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: CreateOrgAssignmentInput,
): Promise<OrgAssignmentRecord> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);

  const userId = String(input.userId ?? "").trim();
  const companyId = String(input.companyId ?? "").trim();
  const orgPositionId = String(input.orgPositionId ?? "").trim();
  if (!userId || !companyId || !orgPositionId) {
    throw new HrApiError("user, company, dan org_position wajib.", 400);
  }
  if (userId === ctx.userId && !ctx.isOwner) {
    throw new HrApiError("Tidak dapat menempatkan diri sendiri (self-assign ditolak).", 403);
  }
  {
    const { isOwnerAccount } = await import("@/lib/auth-model");
    try {
      const targetUser = (await adminPb.collection("users").getOne(userId, {
        fields: "id,account_type,role",
        requestKey: null,
      })) as Record<string, unknown>;
      if (isOwnerAccount(targetUser)) {
        throw new HrApiError(
          "Akun Owner tidak dapat ditempatkan sebagai pemegang jabatan organisasi.",
          400,
        );
      }
    } catch (err) {
      if (err instanceof HrApiError) throw err;
      throw new HrApiError("User pemegang tidak valid.", 400);
    }
  }
  assertCompanyAuthorized(ctx, companyId);

  const { listUserIdsInCompanies } = await import("@/lib/hr/employment-scope");
  const members = await listUserIdsInCompanies(adminPb, [companyId]);
  if (!members.includes(userId)) {
    throw new HrApiError(
      "User bukan anggota aktif entitas jabatan ini. Tambahkan keanggotaan entitas dulu.",
      400,
    );
  }

  const position = await serverGetOrgPosition(adminPb, orgPositionId);
  if (!position || !position.isActive) {
    throw new HrApiError("Jabatan tidak valid atau nonaktif.", 400);
  }

  const authorized = getHrEffectiveCompanyIds(ctx);
  if (!companyInPositionScope(companyId, position, authorized)) {
    throw new HrApiError("Company assignment di luar scope jabatan.", 400, "ORG_ASSIGNMENT_SCOPE_MISMATCH");
  }

  const parent = position.parentPositionId
    ? await serverGetOrgPosition(adminPb, position.parentPositionId)
    : null;

  // Authority: Owner OR canAssignPositionHolder (parent holder / subtree) — not HR module alone.
  {
    const { canAssignPositionHolder } = await import("@/lib/hr/org-authority");
    const { serverListOrgPositions } = await import("@/lib/hr/org-position-server");
    const listed = await serverListOrgPositions(adminPb, ctx, companyId);
    const flat = listed.map((p) => ({
      id: p.id,
      parentPositionId: p.parentPositionId,
      holderUserId: p.holderUserId,
      holderUserIds: p.holderUserIds,
    }));
    // Ensure target/parent holder caches reflected for authority graph
    if (!flat.some((p) => p.id === position.id)) {
      flat.push({
        id: position.id,
        parentPositionId: position.parentPositionId,
        holderUserId: position.holderUserId,
        holderUserIds: position.holderUserIds,
      });
    }
    if (parent && !flat.some((p) => p.id === parent.id)) {
      flat.push({
        id: parent.id,
        parentPositionId: parent.parentPositionId,
        holderUserId: parent.holderUserId,
        holderUserIds: parent.holderUserIds,
      });
    }
    if (!canAssignPositionHolder(ctx, position, parent, flat)) {
      throw new HrApiError(
        "Anda tidak berwenang menetapkan assignment jabatan ini (perlu otoritas hierarki, bukan hanya akses HR).",
        403,
      );
    }
  }

  // 35I-G: one active placement per user (any company)
  if ((await countActiveForUser(adminPb, userId)) > 0) {
    throw new HrApiError(
      "Karyawan sudah memiliki assignment organisasi aktif. Akhiri assignment lama sebelum menempatkan ke company/jabatan lain.",
      409,
      "ORG_ASSIGNMENT_ONE_ACTIVE",
    );
  }
  // 35I-I: position may already have other holders — do NOT block.

  const today = new Date().toISOString().slice(0, 10);
  const body = {
    user: userId,
    company: companyId,
    org_position: orgPositionId,
    is_active: true,
    status: "active",
    effective_from: String(input.effectiveFrom || today).slice(0, 10),
    effective_to: "",
    created_by: ctx.userId,
    updated_by: ctx.userId,
    notes: String(input.notes ?? "").trim(),
  };

  let created: Record<string, unknown>;
  try {
    created = (await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).create(body, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // PocketBase unique index (one active user) or validation
    if (/unique|idx_hr_org_assign_one_active/i.test(msg)) {
      throw new HrApiError(
        "Karyawan sudah memiliki assignment organisasi aktif (constraint).",
        409,
        "ORG_ASSIGNMENT_ONE_ACTIVE",
      );
    }
    throw err;
  }
  const mapped = mapAssignment(created);

  // Post-create race check (user-global only — multi-holder positions allowed)
  const userActiveCount = await countActiveForUser(adminPb, userId);
  if (userActiveCount > 1) {
    await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).delete(mapped.id, {
      requestKey: null,
    });
    throw new HrApiError("Konflik assignment aktif (race). Coba lagi.", 409, "ORG_ASSIGNMENT_ONE_ACTIVE");
  }

  await syncHolderCache(
    adminPb,
    orgPositionId,
    (await listActiveHoldersForPosition(adminPb, orgPositionId))[0]?.userId ?? null,
  );
  try {
    const { ensureActiveCompanyMembership } = await import("@/lib/master-data/membership");
    await ensureActiveCompanyMembership(adminPb, userId, companyId);
  } catch {
    /* membership sync best-effort — assignment remains SSOT for org seat */
  }
  const superior = await deriveSuperiorForAssignment(adminPb, mapped);
  const working = getHrWorkingCompanyIds(ctx);
  if (working[0] === companyId || ctx.isOwner) {
    await mirrorProfileOrgPosition(adminPb, userId, position, superior.superiorUserId);
  }

  return mapped;
}

export async function endOrgAssignment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  assignmentId: string,
): Promise<OrgAssignmentRecord> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);

  const rec = (await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getOne(assignmentId, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  const existing = mapAssignment(rec);
  assertCompanyAuthorized(ctx, existing.companyId);

  const position = await serverGetOrgPosition(adminPb, existing.orgPositionId);
  if (!position) {
    throw new HrApiError("Jabatan assignment tidak ditemukan.", 404);
  }
  const parent = position.parentPositionId
    ? await serverGetOrgPosition(adminPb, position.parentPositionId)
    : null;

  // Phase 35I-K-P1: authority from active holders + canAssignPositionHolder — never holder_user cache alone.
  if (!ctx.isOwner) {
    if (position.isRoot || !position.parentPositionId || !parent) {
      throw new HrApiError("Hanya Owner yang dapat mengakhiri assignment jabatan akar.", 403);
    }
    const { canAssignPositionHolder } = await import("@/lib/hr/org-authority");
    const { serverListOrgPositions } = await import("@/lib/hr/org-position-server");
    const listed = await serverListOrgPositions(adminPb, ctx, existing.companyId);
    const flat = listed.map((p) => ({
      id: p.id,
      parentPositionId: p.parentPositionId,
      holderUserId: p.holderUserId,
      holderUserIds: p.holderUserIds,
    }));
    const parentHolders = await listActiveHoldersForPosition(adminPb, parent.id);
    const parentHolderIds = parentHolders.map((h) => h.userId);
    const parentForAuth = {
      ...parent,
      holderUserId: parentHolderIds[0] ?? null,
      holderUserIds: parentHolderIds,
    };
    const parentIdx = flat.findIndex((p) => p.id === parent.id);
    if (parentIdx >= 0) {
      flat[parentIdx] = {
        id: parent.id,
        parentPositionId: parent.parentPositionId,
        holderUserId: parentHolderIds[0] ?? null,
        holderUserIds: parentHolderIds,
      };
    } else {
      flat.push({
        id: parent.id,
        parentPositionId: parent.parentPositionId,
        holderUserId: parentHolderIds[0] ?? null,
        holderUserIds: parentHolderIds,
      });
    }
    if (!flat.some((p) => p.id === position.id)) {
      const posHolders = await listActiveHoldersForPosition(adminPb, position.id);
      flat.push({
        id: position.id,
        parentPositionId: position.parentPositionId,
        holderUserId: posHolders[0]?.userId ?? null,
        holderUserIds: posHolders.map((h) => h.userId),
      });
    }
    if (!canAssignPositionHolder(ctx, position, parentForAuth, flat)) {
      throw new HrApiError(
        "Anda tidak berwenang mengakhiri assignment ini (perlu otoritas hierarki aktif, bukan cache holder).",
        403,
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const updated = (await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).update(
    assignmentId,
    {
      is_active: false,
      status: "ended",
      effective_to: today,
      updated_by: ctx.userId,
    },
    { requestKey: null },
  )) as unknown as Record<string, unknown>;

  const still = await listActiveHoldersForPosition(adminPb, existing.orgPositionId);
  await syncHolderCache(adminPb, existing.orgPositionId, still[0]?.userId ?? null);

  const working = getHrWorkingCompanyIds(ctx);
  if (working[0] === existing.companyId) {
    await mirrorProfileOrgPosition(adminPb, existing.userId, null, null);
  }

  return mapAssignment(updated);
}

export async function deriveSuperiorForAssignment(
  adminPb: PocketBase,
  assignment: OrgAssignmentRecord,
): Promise<DerivedSuperior> {
  const empty: DerivedSuperior = {
    parentPositionId: null,
    parentPositionName: null,
    superiorUserId: null,
    superiorName: null,
    vacant: false,
  };
  const position = await serverGetOrgPosition(adminPb, assignment.orgPositionId);
  if (!position?.parentPositionId) return empty;

  const parent = await serverGetOrgPosition(adminPb, position.parentPositionId);
  if (!parent) return empty;

  const holder = await getPositionHolderFromAssignment(adminPb, parent.id);
  let superiorName: string | null = null;
  if (holder?.userId) {
    try {
      const u = await adminPb.collection("users").getOne(holder.userId, {
        fields: "id,name,email",
        requestKey: null,
      });
      superiorName = String((u as { name?: string }).name || (u as { email?: string }).email || "");
    } catch {
      superiorName = holder.userId;
    }
  }

  // Scope check: if parent holder exists but parent scope doesn't cover assignment company → unavailable
  if (holder) {
    try {
      const authorized = [assignment.companyId];
      if (!companyInPositionScope(assignment.companyId, parent, authorized)) {
        if (!isGroupWideScope(parent.scopeType)) {
          const eff = effectivePositionCompanyIds(parent, authorized);
          if (!eff.includes(assignment.companyId)) {
            return {
              parentPositionId: parent.id,
              parentPositionName: parent.name,
              superiorUserId: null,
              superiorName: null,
              vacant: true,
            };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    parentPositionId: parent.id,
    parentPositionName: parent.name,
    superiorUserId: holder?.userId ?? null,
    superiorName,
    vacant: !holder,
  };
}

export async function deriveApproverForAssignment(
  adminPb: PocketBase,
  assignment: OrgAssignmentRecord,
): Promise<DerivedApprover> {
  const superior = await deriveSuperiorForAssignment(adminPb, assignment);
  const position = await serverGetOrgPosition(adminPb, assignment.orgPositionId);
  return {
    targetPositionId: assignment.orgPositionId,
    targetPositionName: position?.name || "",
    parentPositionId: superior.parentPositionId,
    parentPositionName: superior.parentPositionName,
    approverUserId: superior.superiorUserId,
    approverName: superior.superiorName,
    vacant: superior.vacant || (!superior.parentPositionId ? false : !superior.superiorUserId),
    reason: !superior.parentPositionId
      ? "Jabatan akar — persetujuan Owner."
      : superior.superiorUserId
        ? "Approver = pemegang jabatan induk (dari assignment)."
        : "Jabatan induk vacant / scope tidak mencakup context — approver unavailable.",
  };
}

/**
 * Resolve organization context for a user in a company:
 * assignment first, else profiles.org_position_id compatibility.
 */
export async function resolveOrgContextForUserCompany(
  adminPb: PocketBase,
  userId: string,
  companyId: string,
): Promise<{
  source: "assignment" | "profile_fallback" | "none";
  assignment: OrgAssignmentRecord | null;
  orgPositionId: string | null;
  orgPositionName: string | null;
  superior: DerivedSuperior;
  approver: DerivedApprover | null;
}> {
  const assignment = await getActiveOrgAssignment(adminPb, userId, companyId);
  if (assignment) {
    const pos = await serverGetOrgPosition(adminPb, assignment.orgPositionId);
    const superior = await deriveSuperiorForAssignment(adminPb, assignment);
    const approver = await deriveApproverForAssignment(adminPb, assignment);
    return {
      source: "assignment",
      assignment,
      orgPositionId: assignment.orgPositionId,
      orgPositionName: pos?.name ?? null,
      superior,
      approver,
    };
  }

  // Compatibility fallback
  try {
    const profiles = await adminPb.collection("profiles").getFullList({
      filter: `user = "${pbEscape(userId)}"`,
      requestKey: null,
    });
    const profile = profiles[0] as { org_position_id?: string } | undefined;
    const posId = String(profile?.org_position_id ?? "").trim();
    if (posId) {
      const pos = await serverGetOrgPosition(adminPb, posId);
      if (pos && (!companyId || pos.companyId === companyId || companyId === "")) {
        const { deriveSuperiorFromPosition } = await import("@/lib/hr/org-position-server");
        const superior = await deriveSuperiorFromPosition(adminPb, posId);
        return {
          source: "profile_fallback",
          assignment: null,
          orgPositionId: posId,
          orgPositionName: pos.name,
          superior,
          approver: null,
        };
      }
    }
  } catch {
    /* ignore */
  }

  return {
    source: "none",
    assignment: null,
    orgPositionId: null,
    orgPositionName: null,
    superior: {
      parentPositionId: null,
      parentPositionName: null,
      superiorUserId: null,
      superiorName: null,
      vacant: false,
    },
    approver: null,
  };
}

export { mapAssignment, parseScopeType, parseScopeCompanyIds };
