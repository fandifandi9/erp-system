/**
 * Phase 35I — PocketBase collection names for module access SSOT.
 */

export const MODULE_ASSIGNMENTS_COLLECTION = "sys_user_module_assignments";
export const MODULE_PERMISSIONS_COLLECTION = "sys_user_module_permissions";
export const MODULE_ENTITIES_COLLECTION = "sys_user_module_entities";

/** Computed fields on session model (not stored in PB users). */
export const SESSION_MODULE_WEB_PATHS_FIELD = "module_web_paths";
export const SESSION_DESK_MODULE_IDS_FIELD = "desk_module_ids";
/** True when session loader ran (assignments may be empty). */
export const SESSION_MODULE_ASSIGNMENTS_ENRICHED_FIELD = "module_assignments_enriched";
