/**
 * Phase 35I-B0 — Owner-only gate for module assignment administration.
 */

import { isOwnerAccount } from "@/lib/auth-model";

export function canManageModuleAssignments(
  user: Record<string, unknown> | null | undefined,
): boolean {
  if (!user) return false;
  return isOwnerAccount(user);
}
