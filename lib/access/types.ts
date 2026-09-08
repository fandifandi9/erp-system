/**
 * Phase 35I — Module access SSOT types.
 * Staff base remains via legacy RBAC; module assignments are additive.
 */

export const MODULE_IDS = [
  "hr",
  "finance",
  "warehouse",
  "purchasing",
  "sales",
  "pos",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const ACCESS_MODES = ["full", "custom"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const ENTITY_SCOPE_MODES = ["selected", "all"] as const;
export type EntityScopeMode = (typeof ENTITY_SCOPE_MODES)[number];

/** Permission key from existing capability registry OR web:path prefix grant. */
export type PermissionKey = string;

export type ModuleAssignmentRecord = {
  id: string;
  userId: string;
  moduleId: ModuleId;
  accessMode: AccessMode;
  entityScopeMode: EntityScopeMode;
  /** When true, module may appear in Meja Kerja (still permission-filtered). */
  deskEnabled: boolean;
  isActive: boolean;
  /** CUSTOM mode — selected permission keys / web: paths. */
  customPermissions: PermissionKey[];
  /** SELECTED entity scope — company ids. Empty when entityScopeMode === "all". */
  entityCompanyIds: string[];
};

/** Resolved effective access for one user (SSOT output). */
export type UserAccessContext = {
  userId: string;
  assignments: ModuleAssignmentRecord[];
  /** Union of legacy RBAC paths + module-granted web paths. */
  webPathPrefixes: string[];
  /** Union of legacy role capabilities + module-granted capability keys. */
  capabilityKeys: Set<PermissionKey>;
  /** Per-module entity scope (moduleId → allowed company ids; empty set = deny all for scoped ops). */
  moduleEntityScope: Map<ModuleId, ModuleEntityScope>;
  /** Module ids enabled for Meja Kerja desk surface. */
  deskModuleIds: Set<ModuleId>;
};

export type ModuleEntityScope = {
  mode: EntityScopeMode;
  /** Resolved company ids the user may access for this module. */
  companyIds: string[];
};

export type ResolveAccessOptions = {
  /** Owner/super-admin authorized entity universe for ALL scope resolution. */
  authorizedEntityIds?: string[];
};
