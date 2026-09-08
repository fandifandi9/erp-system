/**
 * Phase 35I-A — Additive capability resolution (legacy role + module assignment).
 */

import { hasModuleCapability } from "@/lib/access/resolve-effective-access";
import type { PermissionKey, UserAccessContext } from "@/lib/access/types";

/** Legacy role capability OR module-granted capability (additive, fail closed). */
export function hasEffectiveCapability(
  user: Record<string, unknown> | null | undefined,
  accessContext: UserAccessContext | null | undefined,
  capabilityKey: PermissionKey,
  legacyHas: boolean,
): boolean {
  if (legacyHas) return true;
  if (!user) return false;
  return hasModuleCapability(accessContext, capabilityKey);
}
