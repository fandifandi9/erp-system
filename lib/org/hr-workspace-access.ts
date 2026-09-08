/**
 * HR-STAFF-01 — HR workspace detection (Position domain SSOT, not role_code).
 */

import { readActiveWorkspaceDomainFromUser } from "@/lib/org/resolve-primary-workspace";
import { readModuleWebPathsFromUser } from "@/lib/access/context";

/** Position.workspace_domain === hr (session-enriched). */
export function hasHrPositionWorkspaceDomain(
  user: Record<string, unknown> | null | undefined,
): boolean {
  return readActiveWorkspaceDomainFromUser(user) === "hr";
}

/** Exact hub path `/hr` from module/role path grants (compat, not role_code). */
export function hasHrHubPathGrant(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  const modulePaths = readModuleWebPathsFromUser(user);
  if (modulePaths.some((p) => p === "/hr" || p === "/hr/")) return true;
  return false;
}

/**
 * True HR operational workspace for shell/landing:
 * Position domain HR first; else module hub `/hr` compat.
 * Never uses role_code as primary.
 */
export function hasHrOperationalWorkspace(
  user: Record<string, unknown> | null | undefined,
): boolean {
  if (!user) return false;
  if (hasHrPositionWorkspaceDomain(user)) return true;
  return hasHrHubPathGrant(user);
}
