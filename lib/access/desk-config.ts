/**
 * Phase 35I — Meja Kerja desk resolution from access SSOT (not an auth layer).
 */

import { MODULE_REGISTRY } from "@/lib/access/module-registry";
import { readDeskModuleIdsFromUser } from "@/lib/access/context";
import type { UserAccessContext } from "@/lib/access/types";
import { canAccess } from "@/lib/rbac";
import {
  DESK_MODULE_DEFINITIONS,
  type DeskContextualItem,
} from "@/lib/workspace/desk-modules";
import { filterDeskItemsForUser } from "@/lib/workspace/desk-item-filter";

export type ResolvedDeskModuleFromAccess = {
  id: string;
  titleKey: string;
  fullModuleHref: string;
  fullModuleLabelKey: string;
  items: DeskContextualItem[];
};

/**
 * Desk modules from SSOT: requires deskEnabled on assignment + canAccess on each item.
 * Module access without deskEnabled does not appear.
 */
export function resolveDeskModulesFromAccessContext(
  user: Record<string, unknown> | null | undefined,
  context: UserAccessContext | null | undefined,
): ResolvedDeskModuleFromAccess[] {
  if (!user) return [];

  const deskModuleIds =
    context?.deskModuleIds ?? readDeskModuleIdsFromUser(user);
  if (!deskModuleIds.size) return [];

  const enabledDeskIds = new Set<string>();
  for (const moduleId of deskModuleIds) {
    const deskId = MODULE_REGISTRY[moduleId]?.deskModuleId;
    if (deskId) enabledDeskIds.add(deskId);
  }

  return DESK_MODULE_DEFINITIONS.filter((mod) => enabledDeskIds.has(mod.id))
    .filter((mod) => canAccess(user, mod.fullModuleAccessPath))
    .map((mod) => ({
      id: mod.id,
      titleKey: mod.titleKey,
      fullModuleHref: mod.fullModuleHref,
      fullModuleLabelKey: mod.fullModuleLabelKey,
      items: filterDeskItemsForUser(user, mod.items),
    }));
}
