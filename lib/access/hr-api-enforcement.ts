/**
 * Phase 35I-A — HR API authorization enforcement (module assignment + entity scope).
 * Phase 35I-C — Active entity as query filter within authorized HR entities.
 */

import type PocketBase from "pocketbase";
import { loadUserAccessContext } from "@/lib/access/module-assignments-server";
import type { ModuleAssignmentRecord, ModuleId, UserAccessContext } from "@/lib/access/types";
import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertCompanyInScope, HrCompanyScopeError } from "@/lib/hr/company-scope";
import { ModuleAccessError, assertModuleEntityAccess } from "@/lib/access/assert";
import {
  readActiveCompanyIdFromUser,
  resolveWorkingCompanyIds,
} from "@/lib/access/working-entity";

const HR_MODULE: ModuleId = "hr";

export function getActiveModuleAssignment(
  accessContext: UserAccessContext | null | undefined,
  moduleId: ModuleId,
): ModuleAssignmentRecord | null {
  if (!accessContext) return null;
  return accessContext.assignments.find((a) => a.moduleId === moduleId && a.isActive) ?? null;
}

export function hasActiveHrModuleAssignment(
  accessContext: UserAccessContext | null | undefined,
): boolean {
  return Boolean(getActiveModuleAssignment(accessContext, HR_MODULE));
}

/** Owner, or active HR module assignment — role_code=hr is NOT enough alone (FLEX-ORG-05-FIX). */
export function isHrOperationalActor(ctx: HrApiAuthContext): boolean {
  if (ctx.isOwner) return true;
  return hasActiveHrModuleAssignment(ctx.accessContext);
}

/**
 * Admin HR surfaces without mapped capability keys (leave approve, rating admin, etc.).
 * CUSTOM module assignment does not grant these unless owner or FULL HR module.
 * Legacy role_code=hr alone is not sufficient.
 */
export function assertHrAdminSurface(ctx: HrApiAuthContext, message = "Akses HR ditolak."): void {
  if (ctx.isOwner) return;
  const assignment = getActiveModuleAssignment(ctx.accessContext, HR_MODULE);
  if (assignment?.accessMode === "full") return;
  throw new ModuleAccessError(message);
}

/** Load module access context onto HR API context (cached on ctx). */
export async function ensureHrAccessContext(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrApiAuthContext> {
  if (ctx.accessContext !== undefined) return ctx;
  try {
    ctx.accessContext = await loadUserAccessContext(adminPb, ctx.user);
  } catch {
    ctx.accessContext = null;
  }
  return ctx;
}

/**
 * Gate: authenticated + (owner | active HR module).
 * Loads access context for module users.
 * Legacy role_code=hr without module assignment is denied (FLEX-ORG-05-FIX).
 */
export async function requireHrModuleApiUser(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrApiAuthContext> {
  if (ctx.isOwner) return ctx;
  const enriched = await ensureHrAccessContext(adminPb, ctx);
  if (hasActiveHrModuleAssignment(enriched.accessContext)) return enriched;
  throw new ModuleAccessError("Akses HR ditolak.");
}

/**
 * Authorized HR entity ids = membership ∩ module scope (when HR module assigned).
 * Legacy HR/owner without module assignment → membership only.
 * Does NOT apply active-entity filter (authorization set only).
 */
export function getHrEffectiveCompanyIds(ctx: HrApiAuthContext): string[] {
  const membership = ctx.companyIds;
  if (ctx.isOwner) return membership;

  const assignment = getActiveModuleAssignment(ctx.accessContext, HR_MODULE);
  if (!assignment || !ctx.accessContext) return membership;

  const moduleScope = ctx.accessContext.moduleEntityScope.get(HR_MODULE);
  if (!moduleScope || moduleScope.companyIds.length === 0) return [];

  return moduleScope.companyIds.filter((id) => membership.includes(id));
}

/**
 * Phase 35I-C — Working HR companies for queries/lists (authorized ∩ active, with fallback).
 * Returns 0 or 1 id. Never expands beyond getHrEffectiveCompanyIds().
 */
export function getHrWorkingCompanyIds(ctx: HrApiAuthContext): string[] {
  return resolveWorkingCompanyIds(
    getHrEffectiveCompanyIds(ctx),
    readActiveCompanyIdFromUser(ctx.user),
  );
}

/** Single working company id, or null when no authorized HR entity. */
export function getHrWorkingCompanyId(ctx: HrApiAuthContext): string | null {
  return getHrWorkingCompanyIds(ctx)[0] ?? null;
}

/**
 * Membership + module entity authorization, then must match working entity context.
 * Fail closed: active outside HR scope falls back before this assert; B never authorized.
 */
export function assertHrModuleEntityAccess(
  ctx: HrApiAuthContext,
  companyId: string | null | undefined,
  message = "Akses entitas untuk modul HR ditolak.",
): void {
  const id = (companyId ?? "").trim();
  if (!id) {
    throw new ModuleAccessError(message);
  }

  if (!ctx.isOwner) {
    try {
      assertCompanyInScope(id, ctx.companyIds);
    } catch (e) {
      if (e instanceof HrCompanyScopeError) {
        throw new ModuleAccessError(e.message);
      }
      throw e;
    }
  }

  const assignment = getActiveModuleAssignment(ctx.accessContext, HR_MODULE);
  if (assignment && ctx.accessContext) {
    assertModuleEntityAccess(ctx.accessContext, HR_MODULE, id, message);
  }

  const working = getHrWorkingCompanyIds(ctx);
  if (working.length === 0 || !working.includes(id)) {
    throw new ModuleAccessError(message);
  }
}
