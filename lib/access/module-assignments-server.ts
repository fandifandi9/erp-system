/**
 * Phase 35I — Load module assignments from PocketBase (server-only).
 */

import type PocketBase from "pocketbase";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import {
  MODULE_ASSIGNMENTS_COLLECTION,
  MODULE_ENTITIES_COLLECTION,
  MODULE_PERMISSIONS_COLLECTION,
} from "@/lib/access/collections";
import { buildUserAccessContext, resolveModuleWebPathPrefixes } from "@/lib/access/resolve-effective-access";
import { resolveLegacyAllowedPaths } from "@/lib/access/legacy-paths";
import { attachAccessContextToUser } from "@/lib/access/context";
import { isKnownModuleId } from "@/lib/access/module-registry";
import type {
  AccessMode,
  EntityScopeMode,
  ModuleAssignmentRecord,
  ModuleId,
  UserAccessContext,
} from "@/lib/access/types";
import type { AuthUserShape } from "@/lib/auth-model";

type PbAssignmentRow = {
  id: string;
  user: string;
  module_id: string;
  access_mode?: string;
  entity_scope_mode?: string;
  desk_enabled?: boolean;
  is_active?: boolean;
};

type PbPermissionRow = {
  assignment: string;
  permission_key: string;
};

type PbEntityRow = {
  assignment: string;
  company: string;
};

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeAccessMode(raw: unknown): AccessMode {
  const v = String(raw ?? "full").toLowerCase();
  return v === "custom" ? "custom" : "full";
}

function normalizeEntityScopeMode(raw: unknown): EntityScopeMode {
  const v = String(raw ?? "selected").toLowerCase();
  return v === "all" ? "all" : "selected";
}

async function collectionExists(adminPb: PocketBase, name: string): Promise<boolean> {
  try {
    await adminPb.collections.getOne(name);
    return true;
  } catch {
    return false;
  }
}

/** Load active module assignments for a user. Returns [] if collections missing or on error. */
export async function loadModuleAssignmentsForUser(
  adminPb: PocketBase,
  userId: string,
): Promise<ModuleAssignmentRecord[]> {
  if (!userId.trim()) return [];

  const hasMain = await collectionExists(adminPb, MODULE_ASSIGNMENTS_COLLECTION);
  if (!hasMain) return [];

  try {
    const rows = await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).getFullList<PbAssignmentRow>({
      filter: `user = "${pbEscape(userId)}" && is_active = true`,
      requestKey: null,
    });

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const idFilter = ids.map((id) => `assignment = "${pbEscape(id)}"`).join(" || ");

    const [hasPerms, hasEntities] = await Promise.all([
      collectionExists(adminPb, MODULE_PERMISSIONS_COLLECTION),
      collectionExists(adminPb, MODULE_ENTITIES_COLLECTION),
    ]);

    const [permRows, entityRows] = await Promise.all([
      hasPerms
        ? adminPb.collection(MODULE_PERMISSIONS_COLLECTION).getFullList<PbPermissionRow>({
            filter: idFilter,
            requestKey: null,
          })
        : Promise.resolve([]),
      hasEntities
        ? adminPb.collection(MODULE_ENTITIES_COLLECTION).getFullList<PbEntityRow>({
            filter: idFilter,
            requestKey: null,
          })
        : Promise.resolve([]),
    ]);

    const permsByAssignment = new Map<string, string[]>();
    for (const p of permRows) {
      const list = permsByAssignment.get(p.assignment) ?? [];
      list.push(String(p.permission_key));
      permsByAssignment.set(p.assignment, list);
    }

    const entitiesByAssignment = new Map<string, string[]>();
    for (const e of entityRows) {
      const list = entitiesByAssignment.get(e.assignment) ?? [];
      list.push(String(e.company));
      entitiesByAssignment.set(e.assignment, list);
    }

    const out: ModuleAssignmentRecord[] = [];
    for (const row of rows) {
      const moduleId = String(row.module_id);
      if (!isKnownModuleId(moduleId)) continue;
      out.push({
        id: row.id,
        userId,
        moduleId: moduleId as ModuleId,
        accessMode: normalizeAccessMode(row.access_mode),
        entityScopeMode: normalizeEntityScopeMode(row.entity_scope_mode),
        deskEnabled: row.desk_enabled !== false,
        isActive: row.is_active !== false,
        customPermissions: permsByAssignment.get(row.id) ?? [],
        entityCompanyIds: entitiesByAssignment.get(row.id) ?? [],
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Build full UserAccessContext for server enforcement / session enrichment. */
export async function loadUserAccessContext(
  adminPb: PocketBase,
  user: AuthUserShape | Record<string, unknown>,
): Promise<UserAccessContext> {
  const userId = String(user.id ?? "");
  const legacyPaths = resolveLegacyAllowedPaths(user);
  const assignments = await loadModuleAssignmentsForUser(adminPb, userId);
  const authorizedEntityIds = userId
    ? await getAccessibleCompanyIds(adminPb, userId, user)
    : [];

  return buildUserAccessContext(userId, assignments, legacyPaths, {
    authorizedEntityIds,
  });
}

/** Merge legacy + module paths for middleware/session (paths only, no full context in cookie). */
export async function resolveSessionModuleWebPaths(
  adminPb: PocketBase,
  user: AuthUserShape | Record<string, unknown>,
): Promise<string[]> {
  const userId = String(user.id ?? "");
  const assignments = await loadModuleAssignmentsForUser(adminPb, userId);
  return resolveModuleWebPathPrefixes(assignments);
}

export async function enrichUserWithAccessContext(
  adminPb: PocketBase,
  user: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ctx = await loadUserAccessContext(adminPb, user);
  const moduleOnly = resolveModuleWebPathPrefixes(ctx.assignments);
  const withModules = attachAccessContextToUser(user, ctx, moduleOnly);
  try {
    const { enrichUserWithOrgWorkspaceContext } = await import(
      "@/lib/org/active-assignment-workspace-server"
    );
    return await enrichUserWithOrgWorkspaceContext(adminPb, withModules);
  } catch {
    return withModules;
  }
}
