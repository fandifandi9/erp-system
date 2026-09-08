/**
 * Phase FLEX-ORG-02-FIX — HR operational company scope (FOM-aware).
 *
 * Final scope = intersection (fail-closed):
 *   membership ∩ module entity scope
 *   ∩ FOM resolveOperationalEntityScope(hr)
 *   ∩ held position effective scope (when positions exist)
 *
 * FOM Shared ≠ permission / ≠ approval authority.
 * Employment company remains on org assignment (unchanged).
 *
 * getHrWorkingCompanyIds (0–1 active entity) remains for personal /
 * working-context semantics — not for Shared HR admin visibility.
 */

import type PocketBase from "pocketbase";
import {
  getHrEffectiveCompanyIds,
  getHrWorkingCompanyIds,
  isHrOperationalActor,
} from "@/lib/access/hr-api-enforcement";
import { ModuleAccessError } from "@/lib/access/assert";
import { assertCompanyInScope, HrCompanyScopeError } from "@/lib/hr/company-scope";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { effectivePositionCompanyIds } from "@/lib/hr/org-position-scope";
import { resolveOperationalEntityScope } from "@/lib/org/resolve-operational-entity-scope";

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set(b);
  return [...new Set(a.map((x) => x.trim()).filter((id) => id && set.has(id)))];
}

/**
 * Company ids covered by positions the actor currently holds.
 * Returns null when the actor holds no positions (no position-layer constraint).
 */
async function resolveHeldPositionCompanyIds(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  authorized: readonly string[],
): Promise<string[] | null> {
  const { listActiveOrgAssignments } = await import("@/lib/hr/org-assignment-server");
  const assignments = await listActiveOrgAssignments(adminPb, ctx.userId);
  if (assignments.length === 0) return null;

  const { serverListOrgPositions } = await import("@/lib/hr/org-position-server");
  const positions = await serverListOrgPositions(adminPb, ctx, null);
  const held = positions.filter(
    (p) =>
      (p.holderUserIds?.includes(ctx.userId) ?? false) || p.holderUserId === ctx.userId,
  );
  if (held.length === 0) return null;

  const out = new Set<string>();
  for (const p of held) {
    for (const cid of effectivePositionCompanyIds(p, authorized)) {
      if (authorized.includes(cid)) out.add(cid);
    }
  }
  return [...out];
}

export type HrOperationalCompanyScope = {
  companyIds: string[];
  mode: "SHARED" | "SEPARATED" | "owner" | "compat_working";
  employmentCompanyId: string | null;
  managementGroupId: string | null;
};

/**
 * Resolve HR administrative/operational company ids for the actor.
 * Throws HrApiError on unexpected resolver failures (fail closed — no silent []).
 */
export async function resolveHrOperationalCompanyScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrOperationalCompanyScope> {
  const moduleAuth = getHrEffectiveCompanyIds(ctx);

  if (ctx.isOwner) {
    return {
      companyIds: [...moduleAuth],
      mode: "owner",
      employmentCompanyId: null,
      managementGroupId: null,
    };
  }

  if (!isHrOperationalActor(ctx)) {
    return {
      companyIds: [],
      mode: "SEPARATED",
      employmentCompanyId: null,
      managementGroupId: null,
    };
  }

  if (moduleAuth.length === 0) {
    return {
      companyIds: [],
      mode: "SEPARATED",
      employmentCompanyId: null,
      managementGroupId: null,
    };
  }

  let fom;
  try {
    fom = await resolveOperationalEntityScope(adminPb, {
      user: ctx.user,
      functionDomain: "hr",
    });
  } catch (e) {
    throw new HrApiError(
      `Gagal menentukan cakupan operasional HR: ${e instanceof Error ? e.message : "error"}`,
      503,
      "HR_OPS_SCOPE_RESOLVE_FAILED",
    );
  }

  // No employment seat → Separated-like compat: working entity only (never invent Shared).
  if (!fom.employment.employmentCompanyId) {
    return {
      companyIds: intersect(getHrWorkingCompanyIds(ctx), moduleAuth),
      mode: "compat_working",
      employmentCompanyId: null,
      managementGroupId: fom.operational.managementGroupId,
    };
  }

  let ids = intersect(fom.authorizedOperationalCompanyIds, moduleAuth);

  try {
    const held = await resolveHeldPositionCompanyIds(adminPb, ctx, moduleAuth);
    if (held != null) {
      ids = intersect(ids, held);
    }
  } catch (e) {
    throw new HrApiError(
      `Gagal menentukan cakupan posisi HR: ${e instanceof Error ? e.message : "error"}`,
      503,
      "HR_OPS_POSITION_SCOPE_FAILED",
    );
  }

  return {
    companyIds: ids,
    mode: fom.operational.mode,
    employmentCompanyId: fom.employment.employmentCompanyId,
    managementGroupId: fom.operational.managementGroupId,
  };
}

/** Convenience: company id list only. */
export async function getHrOperationalCompanyIds(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<string[]> {
  const scope = await resolveHrOperationalCompanyScope(adminPb, ctx);
  return scope.companyIds;
}

/**
 * Assert company_id is within HR operational scope (FOM-aware).
 * Prefer over assertHrModuleEntityAccess for Shared HR admin mutations.
 */
export async function assertHrOperationalEntityAccess(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  companyId: string | null | undefined,
  message = "Akses entitas untuk modul HR ditolak.",
): Promise<void> {
  const id = (companyId ?? "").trim();
  if (!id) throw new ModuleAccessError(message);

  if (!ctx.isOwner) {
    try {
      assertCompanyInScope(id, ctx.companyIds);
    } catch (e) {
      if (e instanceof HrCompanyScopeError) throw new ModuleAccessError(e.message);
      throw e;
    }
  }

  const ops = await getHrOperationalCompanyIds(adminPb, ctx);
  if (ops.length === 0 || !ops.includes(id)) {
    throw new ModuleAccessError(message);
  }
}

/**
 * Pure intersection helper for tests / composition checks.
 * FOM candidates ∩ module auth ∩ optional position scope.
 */
export function intersectHrOperationalLayers(input: {
  fomCompanyIds: readonly string[];
  moduleAuthCompanyIds: readonly string[];
  positionCompanyIds: readonly string[] | null;
}): string[] {
  let ids = intersect(input.fomCompanyIds, input.moduleAuthCompanyIds);
  if (input.positionCompanyIds != null) {
    ids = intersect(ids, input.positionCompanyIds);
  }
  return ids;
}
