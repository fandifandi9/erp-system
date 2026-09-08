import type { WorkspaceConfig, WorkspaceSection, WorkspaceId } from "@/lib/workspace/types";
import { mergeWorkspaceSections } from "@/lib/workspace/types";
import { staffWorkspaceConfig } from "@/lib/workspace/workspaces/staff";
import { hrWorkspaceConfig } from "@/lib/workspace/workspaces/hr";
import {
  DESK_MODULE_DEFINITIONS,
  type DeskContextualItem,
} from "@/lib/workspace/desk-modules";
import { readAccessContextFromUser, isSessionModuleAccessEnriched } from "@/lib/access/context";
import { resolveDeskModulesFromAccessContext } from "@/lib/access/desk-config";
import { canAccess, getAllowedPathsForUser, hasHrFullWorkspaceAccess } from "@/lib/rbac";
import { isOwnerAccount } from "@/lib/auth-model";
import { filterDeskItemsForUser } from "@/lib/workspace/desk-item-filter";
import { resolvePrimaryWorkspace } from "@/lib/org/resolve-primary-workspace";

export type ResolvedDeskModule = {
  id: string;
  titleKey: string;
  fullModuleHref: string;
  fullModuleLabelKey: string;
  items: DeskContextualItem[];
};

const WORKSPACES: Partial<Record<WorkspaceId, WorkspaceConfig>> = {
  staff: staffWorkspaceConfig,
  hr: hrWorkspaceConfig,
};

export type FilterSectionsOptions = {
  /** Section ids to omit (e.g. personal in sidebar — profile via topbar). */
  excludeSectionIds?: string[];
};

export function resolveWorkspaceId(user: Record<string, unknown> | null | undefined): WorkspaceId | null {
  if (!user) return null;
  if (isOwnerAccount(user)) return "owner";

  // Phase FLEX-ORG-01 — Position domain first; role_code never primary.
  const paths = getAllowedPathsForUser(user);
  const resolved = resolvePrimaryWorkspace({
    user,
    hasHrHubGrant: hasHrFullWorkspaceAccess(user),
    hasFinanceHubGrant: paths.some((p) => p === "/keuangan" || p === "/keuangan/"),
    hasWarehouseHubGrant: paths.some((p) => p === "/gudang" || p === "/gudang/"),
  });
  if (resolved.workspaceId) return resolved.workspaceId;

  if (canAccess(user, "/dashboard-staff")) return "staff";
  if (canAccess(user, "/keuangan")) return "accounting";
  if (canAccess(user, "/gudang")) return "warehouse";
  if (canAccess(user, "/pos")) return "pos";
  if (canAccess(user, "/penjualan")) return "sales";
  if (canAccess(user, "/pembelian")) return "purchasing";
  return null;
}

export function getWorkspaceConfig(id: WorkspaceId): WorkspaceConfig | null {
  return WORKSPACES[id] ?? null;
}

/** Resolve role-aware workspace config for the authenticated user. */
export function getWorkspaceConfigForUser(
  user: Record<string, unknown> | null | undefined,
): WorkspaceConfig | null {
  const id = resolveWorkspaceId(user);
  if (!id) return null;
  return getWorkspaceConfig(id);
}

export function filterQuickActionsForUser(
  config: WorkspaceConfig,
  user: Record<string, unknown>,
): WorkspaceConfig["quickActions"] {
  return config.quickActions.filter((a) => canAccess(user, a.accessPath));
}

export function filterSectionsForUser(
  config: WorkspaceConfig,
  user: Record<string, unknown>,
  options?: FilterSectionsOptions,
): Array<WorkspaceSection & { actions: WorkspaceConfig["quickActions"] }> {
  const allowed = new Set(filterQuickActionsForUser(config, user).map((a) => a.id));
  const exclude = new Set(options?.excludeSectionIds ?? []);

  return mergeWorkspaceSections(config)
    .filter((section) => !exclude.has(section.id))
    .map((section) => resolveSectionActions(section, config, allowed))
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

function resolveSectionActions(
  section: WorkspaceSection,
  config: WorkspaceConfig,
  allowed: Set<string>,
): (WorkspaceSection & { actions: WorkspaceConfig["quickActions"] }) | null {
  const actions = section.actionIds
    .map((id) => config.quickActions.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a && allowed.has(a.id)));
  if (actions.length === 0) return null;
  return { ...section, actions };
}

/** Common navigation sections (attendance, payroll, company). */
export function filterCommonSectionsForUser(
  config: WorkspaceConfig,
  user: Record<string, unknown>,
): Array<WorkspaceSection & { actions: WorkspaceConfig["quickActions"] }> {
  const allowed = new Set(filterQuickActionsForUser(config, user).map((a) => a.id));
  return (config.commonSections ?? [])
    .map((section) => resolveSectionActions(section, config, allowed))
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

/** Meja Kerja — reads access SSOT desk config when present; legacy path filter otherwise. */
export function resolveDeskModulesForUser(
  user: Record<string, unknown> | null | undefined,
): ResolvedDeskModule[] {
  if (!user) return [];

  const accessContext = readAccessContextFromUser(user);
  if (isSessionModuleAccessEnriched(user)) {
    return resolveDeskModulesFromAccessContext(user, accessContext);
  }

  // Legacy Phase 35H — no module assignments loaded on session yet.
  return DESK_MODULE_DEFINITIONS.filter((mod) =>
    canAccess(user, mod.fullModuleAccessPath),
  ).map((mod) => ({
    id: mod.id,
    titleKey: mod.titleKey,
    fullModuleHref: mod.fullModuleHref,
    fullModuleLabelKey: mod.fullModuleLabelKey,
    items: filterDeskItemsForUser(user, mod.items),
  }));
}

/** @deprecated Use resolveDeskModulesForUser — legacy flatten for roleSections config. */
export function filterDeskActionsForUser(
  config: WorkspaceConfig,
  user: Record<string, unknown>,
): WorkspaceConfig["quickActions"] {
  const allowed = new Set(filterQuickActionsForUser(config, user).map((a) => a.id));
  const actions: WorkspaceConfig["quickActions"] = [];
  const seen = new Set<string>();

  for (const section of config.roleSections ?? []) {
    for (const id of section.actionIds) {
      if (seen.has(id) || !allowed.has(id)) continue;
      const action = config.quickActions.find((a) => a.id === id);
      if (action) {
        seen.add(id);
        actions.push(action);
      }
    }
  }

  return actions;
}

/** Main workspace: personal (if any) + common + role sections — all permission-filtered. */
export function filterMainWorkspaceSectionsForUser(
  config: WorkspaceConfig,
  user: Record<string, unknown>,
): Array<WorkspaceSection & { actions: WorkspaceConfig["quickActions"] }> {
  const allowed = new Set(filterQuickActionsForUser(config, user).map((a) => a.id));
  const main: Array<WorkspaceSection & { actions: WorkspaceConfig["quickActions"] }> = [];

  if (config.personalSection) {
    const personal = resolveSectionActions(config.personalSection, config, allowed);
    if (personal) main.push(personal);
  }

  return [...main, ...filterSectionsForUser(config, user)];
}
