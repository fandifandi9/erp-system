/**
 * Phase 35I-B0 — Client-side route access using enriched session model.
 */

import type PocketBase from "pocketbase";
import { canAccess } from "@/lib/rbac";
import type { AuthUserShape } from "@/lib/auth-model";
import { resolveClientAccessUser, readModuleWebPathsFromUser } from "@/lib/access/context";
import { restoreAuthFromHttpOnlyCookie } from "@/lib/pb-auth-cookie";

export function resolveEffectiveClientAccessUser(
  authStoreModel: Record<string, unknown> | null | undefined,
  sessionUser?: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return resolveClientAccessUser(authStoreModel, sessionUser);
}

export function clientCanAccessPath(
  authStoreModel: Record<string, unknown> | null | undefined,
  sessionUser: Record<string, unknown> | null | undefined,
  pathname: string,
): boolean {
  const accessUser = resolveEffectiveClientAccessUser(authStoreModel, sessionUser);
  if (!accessUser) return false;
  return canAccess(accessUser as AuthUserShape, pathname);
}

/** True when access denied and no module paths on either client model (may need session refresh). */
export function shouldRefreshClientAccessSession(
  authStoreModel: Record<string, unknown> | null | undefined,
  sessionUser: Record<string, unknown> | null | undefined,
  pathname: string,
): boolean {
  if (clientCanAccessPath(authStoreModel, sessionUser, pathname)) return false;
  const storePaths = readModuleWebPathsFromUser(authStoreModel);
  const sessionPaths = readModuleWebPathsFromUser(sessionUser);
  return storePaths.length === 0 && sessionPaths.length === 0;
}

/** Refresh enriched model from HttpOnly cookie (GET /api/auth/session). */
export async function refreshClientAccessSession(
  pb: PocketBase,
): Promise<Record<string, unknown> | null> {
  const ok = await restoreAuthFromHttpOnlyCookie(pb, { force: true });
  if (!ok) return null;
  return (pb.authStore.model as Record<string, unknown>) ?? null;
}
