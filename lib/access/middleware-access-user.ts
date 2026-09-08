/**
 * Phase 35I-B0 — Resolve auth user for middleware from authoritative server data.
 * Cookie model may lack module_web_paths until /api/auth/session runs; cold navigations
 * (new tab, hard refresh, bookmark) must still enforce module assignments server-side.
 */

import { isOwnerAccount } from "@/lib/auth-model";
import { isSessionModuleAccessEnriched, readModuleWebPathsFromUser } from "@/lib/access/context";
import { enrichUserWithAccessContext } from "@/lib/access/module-assignments-server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { canAccess } from "@/lib/rbac";
import type { AuthUserShape } from "@/lib/auth-model";
import { isOrgWorkspaceEnriched } from "@/lib/org/resolve-primary-workspace";

export type MiddlewareAuthResolution = {
  user: Record<string, unknown>;
  /** Set when cookie model was enriched from DB and should be refreshed on the response. */
  refreshedModel?: Record<string, unknown>;
};

/**
 * Enrich cookie auth model from PocketBase assignments when needed for pathname access.
 * Skips DB when owner, session already enriched, or legacy/base RBAC already allows path.
 */
export async function resolveMiddlewareAuthUserForPath(
  authUser: Record<string, unknown>,
  pathname: string,
): Promise<MiddlewareAuthResolution> {
  if (isOwnerAccount(authUser)) {
    return { user: authUser };
  }

  if (canAccess(authUser as AuthUserShape, pathname)) {
    return { user: authUser };
  }

  // Enriched cookie with non-empty paths but still denied → assignment genuinely lacks access.
  if (isSessionModuleAccessEnriched(authUser) && readModuleWebPathsFromUser(authUser).length > 0) {
    return { user: authUser };
  }

  try {
    const adminPb = await getInventoryAdminPb();
    const enriched = await enrichUserWithAccessContext(adminPb, authUser);
    return { user: enriched, refreshedModel: enriched };
  } catch {
    /* Fail closed to legacy RBAC paths already on cookie model. */
    return { user: authUser };
  }
}

/**
 * Enrich cookie auth model when landing/home must reflect module assignments
 * (Decision 1: Manager + HR Full → /hr). Always enrich if session not yet enriched.
 */
export async function resolveMiddlewareAuthUserForLanding(
  authUser: Record<string, unknown>,
): Promise<MiddlewareAuthResolution> {
  if (isOwnerAccount(authUser)) {
    return { user: authUser };
  }
  // HR-STAFF-01 — re-enrich when org workspace domain missing (module flag alone is not enough).
  if (isSessionModuleAccessEnriched(authUser) && isOrgWorkspaceEnriched(authUser)) {
    return { user: authUser };
  }
  try {
    const adminPb = await getInventoryAdminPb();
    const enriched = await enrichUserWithAccessContext(adminPb, authUser);
    return { user: enriched, refreshedModel: enriched };
  } catch {
    return { user: authUser };
  }
}
