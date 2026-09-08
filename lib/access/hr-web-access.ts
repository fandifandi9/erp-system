/**
 * Phase 35I-B0 — HR web surface authorization (module assignment + legacy HR role).
 * Uses session-enriched module_web_paths via canAccess; does not change role_code.
 */

import { canAccess } from "@/lib/rbac";
import type { AuthUserShape } from "@/lib/auth-model";

/**
 * HR web page guard: Owner, legacy HR role, or Staff + active HR module assignment.
 * Pass the exact pathname for the page (e.g. "/hr/attendance/suspicious").
 */
export function canAccessHrWebSurface(
  user: AuthUserShape | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false;
  return canAccess(user, pathname);
}
