/**
 * Phase 35I — Resolve effective permissions and web paths from module assignments.
 * Phase 35I-C — CUSTOM derives routes from business capabilities (+ legacy web: keys).
 */

import { getModuleDefinition, listModulePermissionCatalog } from "@/lib/access/module-registry";
import { resolveAllModuleEntityScopes } from "@/lib/access/entity-scope";
import { deriveWebPathsFromBusinessCapabilities } from "@/lib/access/business-capability-map";
import type {
  ModuleAssignmentRecord,
  ModuleId,
  PermissionKey,
  ResolveAccessOptions,
  UserAccessContext,
} from "@/lib/access/types";

function uniquePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function resolveAssignmentPermissions(assignment: ModuleAssignmentRecord): PermissionKey[] {
  const catalog = listModulePermissionCatalog(assignment.moduleId);
  if (assignment.accessMode === "full") {
    return catalog;
  }
  const allowed = new Set(catalog);
  return assignment.customPermissions.filter((k) => allowed.has(k));
}

function permissionKeysToWebPaths(keys: PermissionKey[]): string[] {
  const paths: string[] = [];
  for (const key of keys) {
    if (key.startsWith("web:")) {
      paths.push(key.slice(4));
    }
  }
  return paths;
}

function resolveAssignmentWebPaths(assignment: ModuleAssignmentRecord): string[] {
  const def = getModuleDefinition(assignment.moduleId);
  if (assignment.accessMode === "full") {
    return [...def.webPathPrefixes];
  }
  const perms = resolveAssignmentPermissions(assignment);
  // CUSTOM: business caps → curated paths; keep legacy explicit web: keys.
  return uniquePaths([
    ...permissionKeysToWebPaths(perms),
    ...deriveWebPathsFromBusinessCapabilities(assignment.moduleId, perms),
  ]);
}

/** Resolve module-granted web paths (additive only). */
export function resolveModuleWebPathPrefixes(
  assignments: ModuleAssignmentRecord[],
): string[] {
  const paths: string[] = [];
  for (const a of assignments) {
    if (!a.isActive) continue;
    paths.push(...resolveAssignmentWebPaths(a));
  }
  return uniquePaths(paths);
}

/** Resolve module-granted capability keys (additive only). */
export function resolveModuleCapabilityKeys(
  assignments: ModuleAssignmentRecord[],
): Set<PermissionKey> {
  const keys = new Set<PermissionKey>();
  for (const a of assignments) {
    if (!a.isActive) continue;
    for (const k of resolveAssignmentPermissions(a)) {
      if (!k.startsWith("web:")) keys.add(k);
    }
  }
  return keys;
}

export function resolveDeskEnabledModuleIds(
  assignments: ModuleAssignmentRecord[],
): Set<ModuleId> {
  const ids = new Set<ModuleId>();
  for (const a of assignments) {
    if (a.isActive && a.deskEnabled) ids.add(a.moduleId);
  }
  return ids;
}

export function buildUserAccessContext(
  userId: string,
  assignments: ModuleAssignmentRecord[],
  legacyWebPaths: string[],
  options?: ResolveAccessOptions,
): UserAccessContext {
  const active = assignments.filter((a) => a.isActive);
  const modulePaths = resolveModuleWebPathPrefixes(active);
  const authorizedEntityIds = options?.authorizedEntityIds ?? [];

  return {
    userId,
    assignments: active,
    webPathPrefixes: uniquePaths([...legacyWebPaths, ...modulePaths]),
    capabilityKeys: resolveModuleCapabilityKeys(active),
    moduleEntityScope: resolveAllModuleEntityScopes(active, authorizedEntityIds),
    deskModuleIds: resolveDeskEnabledModuleIds(active),
  };
}

export function hasModuleCapability(
  context: UserAccessContext | null | undefined,
  capabilityKey: PermissionKey,
): boolean {
  if (!context) return false;
  return context.capabilityKeys.has(capabilityKey);
}

/** Validate custom permission keys against module catalog. */
export function normalizeCustomPermissions(
  moduleId: ModuleId,
  keys: string[],
): PermissionKey[] {
  const catalog = new Set(listModulePermissionCatalog(moduleId));
  return keys.filter((k) => catalog.has(k));
}

/** Expose assignment permission resolution for preview (same as runtime). */
export function resolveAssignmentPermissionKeys(
  assignment: ModuleAssignmentRecord,
): PermissionKey[] {
  return resolveAssignmentPermissions(assignment);
}

/** Expose assignment web paths for preview (same as runtime). */
export function resolveAssignmentWebPathPrefixes(
  assignment: ModuleAssignmentRecord,
): string[] {
  return resolveAssignmentWebPaths(assignment);
}
