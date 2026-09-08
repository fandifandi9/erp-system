/**
 * Phase 35I — Entity scope resolution per module assignment.
 */

import type {
  EntityScopeMode,
  ModuleAssignmentRecord,
  ModuleEntityScope,
  ModuleId,
} from "@/lib/access/types";

export function resolveModuleEntityScope(
  assignment: ModuleAssignmentRecord,
  authorizedEntityIds: string[],
): ModuleEntityScope {
  if (assignment.entityScopeMode === "all") {
    return {
      mode: "all",
      companyIds: [...authorizedEntityIds],
    };
  }

  const selected = assignment.entityCompanyIds.filter((id) => authorizedEntityIds.includes(id));
  return {
    mode: "selected",
    companyIds: selected,
  };
}

export function resolveAllModuleEntityScopes(
  assignments: ModuleAssignmentRecord[],
  authorizedEntityIds: string[],
): Map<ModuleId, ModuleEntityScope> {
  const map = new Map<ModuleId, ModuleEntityScope>();
  for (const a of assignments) {
    if (!a.isActive) continue;
    map.set(a.moduleId, resolveModuleEntityScope(a, authorizedEntityIds));
  }
  return map;
}

export function isCompanyAllowedForModule(
  scope: ModuleEntityScope | undefined,
  companyId: string | null | undefined,
): boolean {
  const id = (companyId ?? "").trim();
  if (!id || !scope) return false;
  if (scope.companyIds.length === 0) return false;
  return scope.companyIds.includes(id);
}

export function assertCompanyAllowedForModule(
  scope: ModuleEntityScope | undefined,
  companyId: string | null | undefined,
  message = "Akses entitas untuk modul ditolak.",
): void {
  if (!isCompanyAllowedForModule(scope, companyId)) {
    throw new ModuleEntityScopeError(message);
  }
}

export class ModuleEntityScopeError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ModuleEntityScopeError";
  }
}

export type { EntityScopeMode };
