/**
 * Phase 35I-D/E — Organizational Position Master server (admin PB).
 * Entity scope: authorized ∩ (explicit company | working entity).
 * Org authority: Owner + position-holder subtree — never HR FULL alone.
 */

import type PocketBase from "pocketbase";
import {
  getHrEffectiveCompanyIds,
  getHrWorkingCompanyIds,
  isHrOperationalActor,
} from "@/lib/access/hr-api-enforcement";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  canAssignPositionHolder,
  canEditPositionInSubtree,
  canEstablishChildUnderParent,
  canMovePosition,
  canOwnerManageOrgStructure,
  wouldCreateCycle,
} from "@/lib/hr/org-authority";
import {
  resolveOrgStructureCompanyScope,
} from "@/lib/hr/org-structure-mode-server";
import {
  parseScopeCompanyIds,
  parseScopeType,
  serializeScopeCompanyIds,
} from "@/lib/hr/org-assignment-types";
import {
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
import { buildOrgPositionTree, withChildCounts } from "@/lib/hr/org-position-tree";
import { parseWorkspaceDomain } from "@/lib/org/workspace-domain";

export { buildOrgPositionTree } from "@/lib/hr/org-position-tree";

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

function mapPosition(rec: Record<string, unknown>, holderName?: string | null): OrgPositionRecord {
  const holderUserId = relationId(rec.holder_user);
  const companyId = relationId(rec.company) || "";
  const scopeType = parseScopeType(rec.scope_type);
  let scopeCompanyIds = parseScopeCompanyIds(rec.scope_company_ids);
  if (scopeType === "SELECTED_COMPANIES" && scopeCompanyIds.length === 0 && companyId) {
    scopeCompanyIds = [companyId];
  }
  const orgLevelLabel = String(rec.org_level_label ?? "").trim() || null;
  return {
    id: String(rec.id ?? ""),
    companyId,
    name: String(rec.name ?? "").trim(),
    code: String(rec.code ?? "").trim() || undefined,
    department: String(rec.department ?? "").trim() || undefined,
    division: String(rec.division ?? "").trim() || undefined,
    parentPositionId: relationId(rec.parent_position),
    holderUserId,
    holderName: holderName ?? null,
    isActive: rec.is_active !== false,
    isRoot: rec.is_root === true || !relationId(rec.parent_position),
    sortOrder: Number(rec.sort_order) || 0,
    notes: String(rec.notes ?? "").trim() || undefined,
    scopeType,
    scopeCompanyIds,
    filled: Boolean(holderUserId),
    workspaceDomain: parseWorkspaceDomain(rec.workspace_domain),
    orgLevelLabel,
  };
}

/**
 * Prefer assignment SSOT for holder display; fall back to holder_user cache.
 * Phase 35I-I: one position may have N active holders.
 */
async function enrichHoldersFromAssignments(
  adminPb: PocketBase,
  rows: OrgPositionRecord[],
): Promise<OrgPositionRecord[]> {
  if (rows.length === 0) return rows;
  try {
    const { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } = await import("@/lib/hr/org-assignment-types");
    const posIds = [...new Set(rows.map((r) => r.id).filter(Boolean))];
    if (posIds.length === 0) return rows;
    const or = posIds.map((id) => `org_position = "${pbEscape(id)}"`).join(" || ");
    const assigns = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
      filter: `(${or}) && is_active = true`,
      sort: "created",
      requestKey: null,
    });
    const holdersByPos = new Map<string, string[]>();
    for (const raw of assigns) {
      const rec = raw as unknown as Record<string, unknown>;
      const pid = relationId(rec.org_position);
      const uid = relationId(rec.user);
      if (!pid || !uid) continue;
      const arr = holdersByPos.get(pid) ?? [];
      if (!arr.includes(uid)) arr.push(uid);
      holdersByPos.set(pid, arr);
    }
    return rows.map((r) => {
      const ids = holdersByPos.get(r.id) ?? [];
      if (ids.length > 0) {
        return {
          ...r,
          holderUserId: ids[0]!,
          holderUserIds: ids,
          holderCount: ids.length,
          filled: true,
        };
      }
      return {
        ...r,
        holderUserId: null,
        holderUserIds: [],
        holderCount: 0,
        filled: false,
        holderName: null,
        holderNames: [],
      };
    });
  } catch {
    return rows.map((r) => ({
      ...r,
      holderUserIds: r.holderUserId ? [r.holderUserId] : [],
      holderCount: r.holderUserId ? 1 : 0,
      holderNames: r.holderName ? [r.holderName] : [],
    }));
  }
}

async function resolveHolderNames(
  adminPb: PocketBase,
  rows: OrgPositionRecord[],
): Promise<OrgPositionRecord[]> {
  const enriched = await enrichHoldersFromAssignments(adminPb, rows);
  const ids = [
    ...new Set(enriched.flatMap((r) => r.holderUserIds ?? (r.holderUserId ? [r.holderUserId] : []))),
  ];
  if (ids.length === 0) {
    return enriched.map((r) => ({
      ...r,
      holderNames: [],
      holderCount: r.holderCount ?? 0,
    }));
  }
  const nameById = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const u = await adminPb.collection("users").getOne(id, {
          fields: "id,name,email",
          requestKey: null,
        });
        nameById.set(id, String((u as { name?: string }).name || (u as { email?: string }).email || id));
      } catch {
        nameById.set(id, id);
      }
    }),
  );
  return enriched.map((r) => {
    const hids = r.holderUserIds ?? (r.holderUserId ? [r.holderUserId] : []);
    const names = hids.map((id) => nameById.get(id) ?? id);
    return {
      ...r,
      holderUserId: hids[0] ?? null,
      holderName: names[0] ?? null,
      holderUserIds: hids,
      holderNames: names,
      holderCount: hids.length,
      filled: hids.length > 0,
    };
  });
}

/** Authorized entities = membership ∩ module scope (Owner: membership). */
function getAuthorizedCompanyIds(ctx: HrApiAuthContext): string[] {
  return getHrEffectiveCompanyIds(ctx);
}

function assertCompanyAuthorized(ctx: HrApiAuthContext, companyId: string): void {
  const id = companyId.trim();
  if (!id) throw new HrApiError("Entitas jabatan wajib.", 400);
  const allowed = getAuthorizedCompanyIds(ctx);
  if (!allowed.includes(id)) {
    throw new HrApiError("Entitas di luar scope HR Anda.", 403);
  }
}

async function loadCompanyFlat(
  adminPb: PocketBase,
  companyId: string,
): Promise<OrgPositionRecord[]> {
  const rows = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getFullList({
    filter: `company = "${pbEscape(companyId)}"`,
    sort: "sort_order,name",
    requestKey: null,
  });
  const mapped = rows.map((r) => mapPosition(r as unknown as Record<string, unknown>));
  return resolveHolderNames(adminPb, mapped);
}

export async function serverGetOrgPosition(
  adminPb: PocketBase,
  positionId: string,
): Promise<OrgPositionRecord | null> {
  try {
    const rec = (await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getOne(positionId, {
      requestKey: null,
    })) as unknown as Record<string, unknown>;
    const mapped = mapPosition(rec);
    const [withName] = await resolveHolderNames(adminPb, [mapped]);
    return withName ?? mapped;
  } catch {
    return null;
  }
}

/**
 * List positions for organization tree.
 * Scope follows Organization Structure Mode SSOT (Phase 35I-F1).
 * COMPANY → working entity (explicit company must match working for non-Owner).
 * GROUP → authorized companies (combined hierarchy foundation).
 */
export async function serverListOrgPositions(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId?: string | null,
): Promise<OrgPositionRecord[]> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);

  // FLEX-ORG-04 — no global GROUP/COMPANY gate; authorized companies only.
  const authorized = getAuthorizedCompanyIds(ctx);
  if (authorized.length === 0) return [];

  const { companyIds: filterCompanyIds } = resolveOrgStructureCompanyScope({
    isOwner: ctx.isOwner,
    authorizedCompanyIds: authorized,
    workingCompanyIds: getHrWorkingCompanyIds(ctx),
    requestedCompanyId: companyId,
  });

  if (filterCompanyIds.length === 0) return [];

  const or = filterCompanyIds.map((id) => `company = "${pbEscape(id)}"`).join(" || ");
  const rows = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getFullList({
    filter: `(${or})`,
    sort: "sort_order,name",
    requestKey: null,
  });
  const mapped = rows.map((r) => mapPosition(r as unknown as Record<string, unknown>));
  const named = await resolveHolderNames(adminPb, mapped);
  return withChildCounts(named);
}

export async function deriveSuperiorFromPosition(
  adminPb: PocketBase,
  positionId: string | null | undefined,
): Promise<DerivedSuperior> {
  const empty: DerivedSuperior = {
    parentPositionId: null,
    parentPositionName: null,
    superiorUserId: null,
    superiorName: null,
    vacant: false,
  };
  const id = String(positionId ?? "").trim();
  if (!id) return empty;

  const pos = await serverGetOrgPosition(adminPb, id);
  if (!pos?.parentPositionId) return empty;

  const parent = await serverGetOrgPosition(adminPb, pos.parentPositionId);
  if (!parent) return empty;

  // F3: prefer assignment SSOT for holder
  let superiorUserId = parent.holderUserId;
  let superiorName = parent.holderName ?? null;
  try {
    const { getPositionHolderFromAssignment } = await import("@/lib/hr/org-assignment-server");
    const holder = await getPositionHolderFromAssignment(adminPb, parent.id);
    if (holder) {
      superiorUserId = holder.userId;
      try {
        const u = await adminPb.collection("users").getOne(holder.userId, {
          fields: "id,name,email",
          requestKey: null,
        });
        superiorName = String((u as { name?: string }).name || (u as { email?: string }).email || "");
      } catch {
        superiorName = holder.userId;
      }
    } else {
      superiorUserId = null;
      superiorName = null;
    }
  } catch {
    /* keep cache */
  }

  return {
    parentPositionId: parent.id,
    parentPositionName: parent.name,
    superiorUserId,
    superiorName,
    vacant: !superiorUserId,
  };
}

/**
 * Approver = parent position holder. No HR/Owner fallback when vacant.
 */
export async function deriveApproverForTargetPosition(
  adminPb: PocketBase,
  targetPositionId: string,
): Promise<DerivedApprover> {
  const target = await serverGetOrgPosition(adminPb, targetPositionId);
  if (!target) throw new HrApiError("Jabatan target tidak ditemukan.", 404);

  if (!target.parentPositionId) {
    return {
      targetPositionId: target.id,
      targetPositionName: target.name,
      parentPositionId: null,
      parentPositionName: null,
      approverUserId: null,
      approverName: null,
      vacant: false,
      reason: "Jabatan akar — persetujuan Owner (bukan holder jabatan induk).",
    };
  }

  const parent = await serverGetOrgPosition(adminPb, target.parentPositionId);
  if (!parent) throw new HrApiError("Jabatan induk tidak ditemukan.", 404);

  let approverUserId = parent.holderUserId;
  let approverName = parent.holderName ?? null;
  try {
    const { getPositionHolderFromAssignment } = await import("@/lib/hr/org-assignment-server");
    const holder = await getPositionHolderFromAssignment(adminPb, parent.id);
    if (holder) {
      approverUserId = holder.userId;
      try {
        const u = await adminPb.collection("users").getOne(holder.userId, {
          fields: "id,name,email",
          requestKey: null,
        });
        approverName = String((u as { name?: string }).name || (u as { email?: string }).email || "");
      } catch {
        approverName = holder.userId;
      }
    } else {
      approverUserId = null;
      approverName = null;
    }
  } catch {
    /* cache */
  }

  return {
    targetPositionId: target.id,
    targetPositionName: target.name,
    parentPositionId: parent.id,
    parentPositionName: parent.name,
    approverUserId,
    approverName,
    vacant: !approverUserId,
    reason: approverUserId
      ? "Approver = pemegang jabatan induk (assignment SSOT)."
      : "Jabatan induk vacant — approver unavailable (bukan fallback HR/Owner).",
  };
}

export type CreateOrgPositionInput = {
  companyId: string;
  name: string;
  code?: string;
  department?: string;
  division?: string;
  parentPositionId?: string | null;
  sortOrder?: number;
  notes?: string;
  isActive?: boolean;
  scopeType?: string;
  scopeCompanyIds?: string[];
  /** FLEX-ORG-01 — functional domain; never inferred from name */
  workspaceDomain?: string | null;
  /** Optional label only — not a permission */
  orgLevelLabel?: string | null;
};

export async function serverCreateOrgPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: CreateOrgPositionInput,
): Promise<OrgPositionRecord> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);
  assertCompanyAuthorized(ctx, input.companyId);

  const name = String(input.name ?? "").trim();
  if (!name) throw new HrApiError("Nama jabatan wajib.", 400);

  const parentId = String(input.parentPositionId ?? "").trim() || null;
  let parent: OrgPositionRecord | null = null;
  if (parentId) {
    parent = await serverGetOrgPosition(adminPb, parentId);
    if (!parent) throw new HrApiError("Jabatan induk tidak ditemukan.", 404);
    assertCompanyAuthorized(ctx, parent.companyId);
    if (!parent.isActive) {
      throw new HrApiError("Tidak dapat menambah jabatan di bawah induk nonaktif.", 400);
    }
  }

  const listedForAuth = await serverListOrgPositions(adminPb, ctx, null).catch(
    () => [] as OrgPositionRecord[],
  );
  const flatForAuth = listedForAuth.map((p) => ({
    id: p.id,
    parentPositionId: p.parentPositionId,
    holderUserId: p.holderUserId,
    holderUserIds: p.holderUserIds,
    isRoot: p.isRoot,
  }));
  if (parent && !flatForAuth.some((p) => p.id === parent.id)) {
    flatForAuth.push({
      id: parent.id,
      parentPositionId: parent.parentPositionId,
      holderUserId: parent.holderUserId,
      holderUserIds: parent.holderUserIds,
      isRoot: parent.isRoot,
    });
  }

  if (!canEstablishChildUnderParent(ctx, parent, flatForAuth)) {
    if (!parent) {
      throw new HrApiError("Hanya Owner yang dapat menetapkan jabatan akar.", 403);
    }
    throw new HrApiError(
      "Anda tidak berwenang menambah struktur di bawah jabatan ini. Pemegang jabatan operasional (staff) tidak dapat menambah bawahan — hanya Owner atau atasan manajerial.",
      403,
    );
  }

  const companyId = input.companyId.trim();
  const authorized = getAuthorizedCompanyIds(ctx);
  let scopeType = parseScopeType(input.scopeType);
  let scopeCompanyIds =
    input.scopeCompanyIds != null
      ? [...new Set(input.scopeCompanyIds.map((x) => String(x || "").trim()).filter(Boolean))]
      : [companyId];
  if (scopeType === "SELECTED_COMPANIES" && scopeCompanyIds.length === 0) {
    scopeCompanyIds = [companyId];
  }

  const draftChild: OrgPositionRecord = {
    id: "__new__",
    companyId,
    name,
    parentPositionId: parentId,
    holderUserId: null,
    isActive: true,
    isRoot: !parentId,
    sortOrder: 0,
    scopeType,
    scopeCompanyIds,
    filled: false,
  };
  if (parent) {
    const parentEff = effectivePositionCompanyIds(parent, authorized);
    const childEff = effectivePositionCompanyIds(draftChild, authorized);
    if (!isChildScopeSubsetOfParent(childEff, parentEff, isGroupWideScope(parent.scopeType))) {
      throw new HrApiError(
        "Scope company child harus subset dari scope parent.",
        400,
        "ORG_SCOPE_CHILD_NOT_SUBSET",
      );
    }
  }

  const body: Record<string, unknown> = {
    company: companyId,
    name,
    code: String(input.code ?? "").trim(),
    department: String(input.department ?? "").trim(),
    division: String(input.division ?? "").trim(),
    parent_position: parentId || null,
    is_active: input.isActive !== false,
    is_root: !parentId,
    sort_order: Number(input.sortOrder) || 0,
    notes: String(input.notes ?? "").trim(),
    scope_type: scopeType,
    scope_company_ids: serializeScopeCompanyIds(scopeCompanyIds),
  };
  const wd = parseWorkspaceDomain(input.workspaceDomain);
  if (wd) body.workspace_domain = wd;
  if (input.orgLevelLabel != null) {
    body.org_level_label = String(input.orgLevelLabel).trim();
  }

  const rec = (await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).create(body, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  return mapPosition(rec);
}

export type UpdateOrgPositionInput = {
  name?: string;
  code?: string;
  department?: string;
  division?: string;
  notes?: string;
  sortOrder?: number;
  isActive?: boolean;
  /** Prefer serverMoveOrgPosition for parent changes. */
  parentPositionId?: string | null;
  holderUserId?: string | null;
  workspaceDomain?: string | null;
  orgLevelLabel?: string | null;
};

async function syncProfileOrgPosition(
  adminPb: PocketBase,
  userId: string | null,
  position: OrgPositionRecord | null,
): Promise<void> {
  if (!userId) return;
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
      },
      { requestKey: null },
    );
  } catch {
    /* soft-fail */
  }
}

async function clearProfileOrgPositionIfMatches(
  adminPb: PocketBase,
  userId: string,
  positionId: string,
): Promise<void> {
  try {
    const profiles = await adminPb.collection("profiles").getFullList({
      filter: `user = "${pbEscape(userId)}"`,
      requestKey: null,
    });
    const profile = profiles[0] as { id: string; org_position_id?: string } | undefined;
    if (!profile) return;
    if (String(profile.org_position_id || "") !== positionId) return;
    await adminPb.collection("profiles").update(
      profile.id,
      { org_position_id: "" },
      { requestKey: null },
    );
  } catch {
    /* ignore */
  }
}

export async function serverUpdateOrgPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  positionId: string,
  input: UpdateOrgPositionInput,
): Promise<OrgPositionRecord> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);

  const existing = await serverGetOrgPosition(adminPb, positionId);
  if (!existing) throw new HrApiError("Jabatan tidak ditemukan.", 404);
  assertCompanyAuthorized(ctx, existing.companyId);

  const flat = await serverListOrgPositions(adminPb, ctx, null);
  const parent = existing.parentPositionId
    ? flat.find((p) => p.id === existing.parentPositionId) ??
      (await serverGetOrgPosition(adminPb, existing.parentPositionId))
    : null;

  let rest: UpdateOrgPositionInput = { ...input };

  const metadataChange =
    rest.name != null ||
    rest.department != null ||
    rest.division != null ||
    rest.code != null ||
    rest.notes != null ||
    rest.sortOrder != null ||
    typeof rest.isActive === "boolean" ||
    rest.workspaceDomain !== undefined ||
    rest.orgLevelLabel !== undefined;

  if (metadataChange) {
    if (existing.isRoot || !existing.parentPositionId) {
      if (!canOwnerManageOrgStructure(ctx)) {
        throw new HrApiError("Jabatan akar hanya dapat diubah oleh Owner.", 403);
      }
    } else if (!canEditPositionInSubtree(ctx, existing, flat)) {
      throw new HrApiError(
        "Anda tidak berwenang mengubah jabatan ini. Hanya Owner atau atasan dalam hierarki (bukan HR capability).",
        403,
      );
    }
  }

  if (rest.holderUserId !== undefined) {
    if (!canAssignPositionHolder(ctx, existing, parent, flat)) {
      throw new HrApiError("Anda tidak berwenang menetapkan pemegang jabatan ini.", 403);
    }
    const nextHolder = String(rest.holderUserId ?? "").trim() || null;
    if (nextHolder === ctx.userId && !ctx.isOwner) {
      throw new HrApiError("Tidak dapat menempatkan diri sendiri ke jabatan melalui jalur ini.", 403);
    }
    if (nextHolder && !existing.isActive) {
      throw new HrApiError("Tidak dapat menetapkan pemegang pada jabatan nonaktif.", 400);
    }
    if (nextHolder) {
      try {
        const holderUser = (await adminPb.collection("users").getOne(nextHolder, {
          fields: "id,account_type,role",
          requestKey: null,
        })) as Record<string, unknown>;
        const { isOwnerAccount } = await import("@/lib/auth-model");
        if (isOwnerAccount(holderUser)) {
          throw new HrApiError(
            "Akun Owner tidak dapat ditempatkan sebagai pemegang jabatan organisasi.",
            400,
          );
        }
      } catch (err) {
        if (err instanceof HrApiError) throw err;
        throw new HrApiError("Pemegang jabatan tidak valid.", 400);
      }
    }

    const { createOrgAssignment, listActiveOrgAssignments } = await import(
      "@/lib/hr/org-assignment-server"
    );

    // Phase 35I-I: ADD holder (multi). Empty value does not wipe all holders.
    if (nextHolder) {
      const actives = await listActiveOrgAssignments(adminPb, nextHolder);
      const otherSeat = actives.find((a) => a.orgPositionId !== positionId);
      if (otherSeat) {
        throw new HrApiError(
          "Tidak dapat merangkap jabatan. Karyawan sudah menjadi pemegang jabatan lain — kosongkan jabatan itu dulu.",
          409,
          "ORG_ASSIGNMENT_ONE_ACTIVE",
        );
      }
      const alreadyHere = actives.some((a) => a.orgPositionId === positionId);
      if (!alreadyHere) {
        await createOrgAssignment(adminPb, ctx, {
          userId: nextHolder,
          companyId: existing.companyId,
          orgPositionId: positionId,
        });
      }
    }
    rest = { ...rest, holderUserId: undefined };
  }

  // Parent change via PATCH is routed through move guards (cycle + authority).
  if (rest.parentPositionId !== undefined) {
    const moved = await serverMoveOrgPosition(adminPb, ctx, positionId, {
      newParentPositionId: rest.parentPositionId,
      name: rest.name,
      code: rest.code,
      department: rest.department,
      division: rest.division,
      notes: rest.notes,
      sortOrder: rest.sortOrder,
      isActive: rest.isActive,
    });
    return moved;
  }

  const patch: Record<string, unknown> = {};
  if (rest.name != null) patch.name = String(rest.name).trim();
  if (rest.code != null) patch.code = String(rest.code).trim();
  if (rest.department != null) patch.department = String(rest.department).trim();
  if (rest.division != null) patch.division = String(rest.division).trim();
  if (rest.notes != null) patch.notes = String(rest.notes).trim();
  if (rest.sortOrder != null) patch.sort_order = Number(rest.sortOrder) || 0;
  if (typeof rest.isActive === "boolean") patch.is_active = rest.isActive;
  if (rest.workspaceDomain !== undefined) {
    const wd = parseWorkspaceDomain(rest.workspaceDomain);
    patch.workspace_domain = wd;
  }
  if (rest.orgLevelLabel !== undefined) {
    patch.org_level_label = String(rest.orgLevelLabel ?? "").trim();
  }

  if (Object.keys(patch).length === 0) {
    const refreshed = await serverGetOrgPosition(adminPb, positionId);
    return refreshed ?? existing;
  }

  const rec = (await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).update(positionId, patch, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  const updated = mapPosition(rec);
  const [named] = await resolveHolderNames(adminPb, [updated]);
  const result = named ?? updated;

  if (rest.name != null && result.holderUserId) {
    await syncProfileOrgPosition(adminPb, result.holderUserId, result);
  }

  return result;
}

async function applyHolderSync(
  adminPb: PocketBase,
  positionId: string,
  prevHolder: string | null,
  result: OrgPositionRecord,
): Promise<void> {
  const nextHolder = result.holderUserId;
  if (prevHolder && prevHolder !== nextHolder) {
    await clearProfileOrgPositionIfMatches(adminPb, prevHolder, positionId);
  }
  if (nextHolder) {
    // Ensure single-holder: clear org_position_id on other profiles pointing here is already by position id
    await syncProfileOrgPosition(adminPb, nextHolder, result);
    const superior = await deriveSuperiorFromPosition(adminPb, positionId);
    try {
      const profiles = await adminPb.collection("profiles").getFullList({
        filter: `user = "${pbEscape(nextHolder)}"`,
        requestKey: null,
      });
      const profile = profiles[0] as { id: string } | undefined;
      if (profile) {
        await adminPb.collection("profiles").update(
          profile.id,
          { manager: superior.superiorUserId || null },
          { requestKey: null },
        );
      }
    } catch {
      /* ignore */
    }
  }
}

export type MoveOrgPositionInput = {
  newParentPositionId: string | null;
  name?: string;
  code?: string;
  department?: string;
  division?: string;
  notes?: string;
  sortOrder?: number;
  isActive?: boolean;
  holderUserId?: string | null;
};

export async function serverMoveOrgPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  positionId: string,
  input: MoveOrgPositionInput,
): Promise<OrgPositionRecord> {
  if (!isHrOperationalActor(ctx)) throw new HrApiError("Akses HR ditolak.", 403);

  const existing = await serverGetOrgPosition(adminPb, positionId);
  if (!existing) throw new HrApiError("Jabatan tidak ditemukan.", 404);
  assertCompanyAuthorized(ctx, existing.companyId);

  const flat = await serverListOrgPositions(adminPb, ctx, null);
  const nextParentId =
    input.newParentPositionId === null || input.newParentPositionId === ""
      ? null
      : String(input.newParentPositionId).trim();

  if (nextParentId === positionId) {
    throw new HrApiError("Jabatan tidak dapat menjadi induk dirinya sendiri.", 400);
  }

  if (wouldCreateCycle(flat, positionId, nextParentId)) {
    throw new HrApiError("Tidak dapat memindahkan jabatan ke bawahannya sendiri (siklus).", 400);
  }

  let newParent: OrgPositionRecord | null = null;
  if (nextParentId) {
    newParent = flat.find((p) => p.id === nextParentId) ?? (await serverGetOrgPosition(adminPb, nextParentId));
    if (!newParent) {
      throw new HrApiError("Jabatan induk tidak valid.", 400);
    }
    assertCompanyAuthorized(ctx, newParent.companyId);
    const authorized = getAuthorizedCompanyIds(ctx);
    const parentEff = effectivePositionCompanyIds(newParent, authorized);
    const childEff = effectivePositionCompanyIds(existing, authorized);
    if (!isChildScopeSubsetOfParent(childEff, parentEff, isGroupWideScope(newParent.scopeType))) {
      throw new HrApiError(
        "Scope company child harus subset dari scope parent setelah pemindahan.",
        400,
        "ORG_SCOPE_CHILD_NOT_SUBSET",
      );
    }
    if (!newParent.isActive) {
      throw new HrApiError("Tidak dapat memindahkan ke bawah jabatan induk nonaktif.", 400);
    }
  }

  if (!canMovePosition(ctx, existing, newParent, flat)) {
    if (!nextParentId && !ctx.isOwner) {
      throw new HrApiError("Hanya Owner yang dapat menetapkan jabatan akar.", 403);
    }
    throw new HrApiError(
      "Anda tidak berwenang memindahkan jabatan ini. Sibling/peer terisolasi; hanya Owner atau atasan hierarki.",
      403,
    );
  }

  const patch: Record<string, unknown> = {
    parent_position: nextParentId,
    is_root: !nextParentId,
  };
  if (input.name != null) patch.name = String(input.name).trim();
  if (input.code != null) patch.code = String(input.code).trim();
  if (input.department != null) patch.department = String(input.department).trim();
  if (input.division != null) patch.division = String(input.division).trim();
  if (input.notes != null) patch.notes = String(input.notes).trim();
  if (input.sortOrder != null) patch.sort_order = Number(input.sortOrder) || 0;
  if (typeof input.isActive === "boolean") patch.is_active = input.isActive;

  const rec = (await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).update(positionId, patch, {
    requestKey: null,
  })) as unknown as Record<string, unknown>;
  const updated = mapPosition(rec);
  const [named] = await resolveHolderNames(adminPb, [updated]);
  const result = named ?? updated;

  // Subtree stays attached via parent_position links — no orphan rewrite needed.
  // Sync derived manager for holder after move
  if (result.holderUserId) {
    const superior = await deriveSuperiorFromPosition(adminPb, positionId);
    try {
      const profiles = await adminPb.collection("profiles").getFullList({
        filter: `user = "${pbEscape(result.holderUserId)}"`,
        requestKey: null,
      });
      const profile = profiles[0] as { id: string } | undefined;
      if (profile) {
        await adminPb.collection("profiles").update(
          profile.id,
          { manager: superior.superiorUserId || null },
          { requestKey: null },
        );
      }
    } catch {
      /* ignore */
    }
  }

  return result;
}

/**
 * Soft-deactivate preferred. Hard delete: Owner only, no children.
 * Clears assignment/holder/profile links first so vacant leaves can be removed.
 */
export async function serverDeleteOrgPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  positionId: string,
): Promise<void> {
  if (!canOwnerManageOrgStructure(ctx)) {
    throw new HrApiError("Hanya Owner yang dapat menghapus jabatan.", 403);
  }
  const existing = await serverGetOrgPosition(adminPb, positionId);
  if (!existing) throw new HrApiError("Jabatan tidak ditemukan.", 404);
  assertCompanyAuthorized(ctx, existing.companyId);

  const children = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getFullList({
    filter: `parent_position = "${pbEscape(positionId)}"`,
    requestKey: null,
  });
  if (children.length > 0) {
    throw new HrApiError(
      "Tidak dapat menghapus: masih ada jabatan bawahan. Hapus bawahan dulu, atau gunakan Kosongkan struktur.",
      400,
    );
  }

  await purgeLinksForPosition(adminPb, positionId);
  await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).delete(positionId, { requestKey: null });
}

/**
 * Owner-only: hapus seluruh jabatan + assignment terkait.
 * Assignment harus dihapus (bukan hanya diakhiri) karena org_position adalah relasi wajib di PocketBase.
 */
export async function serverResetAllOrgPositions(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<{ deletedPositions: number; endedAssignments: number }> {
  if (!canOwnerManageOrgStructure(ctx)) {
    throw new HrApiError("Hanya Owner yang dapat mengosongkan struktur organisasi.", 403);
  }

  const { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } = await import("@/lib/hr/org-assignment-types");

  let endedAssignments = 0;
  try {
    const assigns = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
      requestKey: null,
    });
    for (const raw of assigns) {
      const rec = raw as { id: string };
      await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).delete(rec.id, {
        requestKey: null,
      });
      endedAssignments += 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/missing collection|wasn't found|404/i.test(msg)) {
      throw new HrApiError(
        `Gagal menghapus assignment organisasi sebelum reset: ${msg}`,
        500,
      );
    }
  }

  // Clear compatibility mirrors
  try {
    const profiles = await adminPb.collection("profiles").getFullList({
      filter: `org_position_id != ""`,
      requestKey: null,
    });
    for (const raw of profiles) {
      const p = raw as { id: string; org_position_id?: string };
      if (!String(p.org_position_id || "").trim()) continue;
      await adminPb.collection("profiles").update(
        p.id,
        { org_position_id: "", manager: null },
        { requestKey: null },
      );
    }
  } catch {
    /* ignore */
  }

  const positions = await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).getFullList({
    requestKey: null,
  });

  // Detach parents/holders so deletes are not blocked by self-relation order
  for (const raw of positions) {
    const p = raw as { id: string };
    await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).update(
      p.id,
      { parent_position: null, holder_user: null, is_root: true },
      { requestKey: null },
    );
  }

  let deletedPositions = 0;
  const failures: string[] = [];
  for (const raw of positions) {
    const p = raw as { id: string; name?: string };
    try {
      await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).delete(p.id, { requestKey: null });
      deletedPositions += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${p.name || p.id}: ${msg}`);
    }
  }

  if (failures.length > 0) {
    throw new HrApiError(
      `Sebagian jabatan gagal dihapus (${deletedPositions}/${positions.length}). ${failures[0]}`,
      500,
    );
  }

  return { deletedPositions, endedAssignments };
}

async function purgeLinksForPosition(adminPb: PocketBase, positionId: string): Promise<void> {
  try {
    const { HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION } = await import("@/lib/hr/org-assignment-types");
    // Hard-delete: org_position is a required relation — soft-end leaves FK that blocks position delete.
    const assigns = await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).getFullList({
      filter: `org_position = "${pbEscape(positionId)}"`,
      requestKey: null,
    });
    for (const raw of assigns) {
      const a = raw as { id: string };
      await adminPb.collection(HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION).delete(a.id, {
        requestKey: null,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/missing collection|wasn't found|404/i.test(msg)) {
      throw new HrApiError(`Gagal membersihkan assignment jabatan: ${msg}`, 500);
    }
  }

  try {
    const profiles = await adminPb.collection("profiles").getFullList({
      filter: `org_position_id = "${pbEscape(positionId)}"`,
      requestKey: null,
    });
    for (const raw of profiles) {
      const p = raw as { id: string };
      await adminPb.collection("profiles").update(
        p.id,
        { org_position_id: "", manager: null },
        { requestKey: null },
      );
    }
  } catch {
    /* ignore */
  }

  try {
    await adminPb.collection(HR_ORG_POSITIONS_COLLECTION).update(
      positionId,
      { holder_user: null },
      { requestKey: null },
    );
  } catch {
    /* ignore */
  }
}

/** Deactivate (archive) — refuses nothing for children; keeps graph intact. */
export async function serverDeactivateOrgPosition(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  positionId: string,
): Promise<OrgPositionRecord> {
  return serverUpdateOrgPosition(adminPb, ctx, positionId, { isActive: false });
}
