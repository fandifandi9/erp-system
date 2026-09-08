export type {
  AccessMode,
  EntityScopeMode,
  ModuleAssignmentRecord,
  ModuleEntityScope,
  ModuleId,
  PermissionKey,
  ResolveAccessOptions,
  UserAccessContext,
} from "@/lib/access/types";

export { MODULE_IDS, ACCESS_MODES, ENTITY_SCOPE_MODES } from "@/lib/access/types";

export {
  MODULE_REGISTRY,
  getModuleDefinition,
  isKnownModuleId,
  listModulePermissionCatalog,
  webPathPermissionKey,
} from "@/lib/access/module-registry";

export {
  buildUserAccessContext,
  hasModuleCapability,
  normalizeCustomPermissions,
  resolveAssignmentPermissionKeys,
  resolveAssignmentWebPathPrefixes,
  resolveDeskEnabledModuleIds,
  resolveModuleCapabilityKeys,
  resolveModuleWebPathPrefixes,
} from "@/lib/access/resolve-effective-access";

export {
  assertCompanyAllowedForModule,
  isCompanyAllowedForModule,
  ModuleEntityScopeError,
  resolveAllModuleEntityScopes,
  resolveModuleEntityScope,
} from "@/lib/access/entity-scope";

export {
  attachAccessContextToUser,
  attachFullAccessContextToUser,
  isSessionModuleAccessEnriched,
  readAccessContextFromUser,
  readDeskModuleIdsFromUser,
  readModuleWebPathsFromUser,
} from "@/lib/access/context";

export { mergeAllowedPathPrefixes, resolveLegacyAllowedPaths } from "@/lib/access/legacy-paths";

export {
  assertModuleCapability,
  assertModuleEntityAccess,
  assertModuleWebRoute,
  getAccessContextOrNull,
  ModuleAccessError,
} from "@/lib/access/assert";

export { hasEffectiveCapability } from "@/lib/access/effective-capability";

export {
  assertHrAdminSurface,
  assertHrModuleEntityAccess,
  ensureHrAccessContext,
  getActiveModuleAssignment,
  getHrEffectiveCompanyIds,
  getHrWorkingCompanyId,
  getHrWorkingCompanyIds,
  hasActiveHrModuleAssignment,
  isHrOperationalActor,
  requireHrModuleApiUser,
} from "@/lib/access/hr-api-enforcement";

export {
  readActiveCompanyIdFromUser,
  resolveWorkingCompanyIds,
} from "@/lib/access/working-entity";

export { resolveDeskModulesFromAccessContext } from "@/lib/access/desk-config";

export {
  MODULE_ASSIGNMENTS_COLLECTION,
  MODULE_ENTITIES_COLLECTION,
  MODULE_PERMISSIONS_COLLECTION,
  SESSION_MODULE_WEB_PATHS_FIELD,
} from "@/lib/access/collections";

export {
  loadModuleAssignmentsForUser,
  loadUserAccessContext,
} from "@/lib/access/module-assignments-server";
