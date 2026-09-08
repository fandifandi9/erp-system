/**
 * Phase 35I-B0 — Owner module assignment CRUD (server-only).
 */

import type PocketBase from "pocketbase";
import {
  MODULE_ASSIGNMENTS_COLLECTION,
  MODULE_ENTITIES_COLLECTION,
  MODULE_PERMISSIONS_COLLECTION,
} from "@/lib/access/collections";
import { isOwnerOnlyModuleCapability } from "@/lib/access/owner-only-capabilities";
import {
  isKnownModuleId,
  listModulePermissionCatalog,
  MODULE_REGISTRY,
} from "@/lib/access/module-registry";
import { buildUserAccessContext } from "@/lib/access/resolve-effective-access";
import {
  readActiveCompanyIdFromUser,
  resolveWorkingCompanyIds,
} from "@/lib/access/working-entity";
import { listAccessibleCompanyIds } from "@/lib/tenant/company-access";
import type { AccessMode, EntityScopeMode, ModuleId } from "@/lib/access/types";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type ModuleAssignmentAdminRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  moduleId: ModuleId;
  moduleLabel: string;
  accessMode: AccessMode;
  entityScopeMode: EntityScopeMode;
  deskEnabled: boolean;
  isActive: boolean;
  customPermissions: string[];
  entityCompanyIds: string[];
  entityCompanyNames: string[];
  notes?: string;
  capabilityCount: number;
};

export type ModuleAssignmentWriteInput = {
  userId: string;
  moduleId: ModuleId;
  accessMode: AccessMode;
  entityScopeMode: EntityScopeMode;
  deskEnabled: boolean;
  isActive: boolean;
  customPermissions?: string[];
  entityCompanyIds?: string[];
  notes?: string;
};

type PbAssignmentRow = {
  id: string;
  user: string;
  module_id: string;
  access_mode?: string;
  entity_scope_mode?: string;
  desk_enabled?: boolean;
  is_active?: boolean;
  notes?: string;
  expand?: {
    user?: { id: string; name?: string; email?: string };
  };
};

function normalizeAccessMode(raw: unknown): AccessMode {
  return String(raw ?? "full").toLowerCase() === "custom" ? "custom" : "full";
}

function normalizeEntityScopeMode(raw: unknown): EntityScopeMode {
  return String(raw ?? "selected").toLowerCase() === "all" ? "all" : "selected";
}

async function loadPermissionsForAssignments(
  adminPb: PocketBase,
  assignmentIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!assignmentIds.length) return map;
  const filter = assignmentIds.map((id) => `assignment = "${pbEscape(id)}"`).join(" || ");
  const rows = await adminPb.collection(MODULE_PERMISSIONS_COLLECTION).getFullList<{
    assignment: string;
    permission_key: string;
  }>({ filter, requestKey: null });
  for (const r of rows) {
    const list = map.get(r.assignment) ?? [];
    list.push(String(r.permission_key));
    map.set(r.assignment, list);
  }
  return map;
}

async function loadEntitiesForAssignments(
  adminPb: PocketBase,
  assignmentIds: string[],
): Promise<Map<string, { companyId: string; name: string }[]>> {
  const map = new Map<string, { companyId: string; name: string }[]>();
  if (!assignmentIds.length) return map;
  const filter = assignmentIds.map((id) => `assignment = "${pbEscape(id)}"`).join(" || ");
  const rows = await adminPb.collection(MODULE_ENTITIES_COLLECTION).getFullList<{
    assignment: string;
    company: string;
    expand?: { company?: { id: string; company_name?: string; code?: string } };
  }>({ filter, expand: "company", requestKey: null });
  for (const r of rows) {
    const list = map.get(r.assignment) ?? [];
    const c = r.expand?.company;
    list.push({
      companyId: String(r.company),
      name: String(c?.company_name || c?.code || r.company),
    });
    map.set(r.assignment, list);
  }
  return map;
}

export async function listAllModuleAssignmentsAdmin(
  adminPb: PocketBase,
): Promise<ModuleAssignmentAdminRow[]> {
  const rows = await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).getFullList<PbAssignmentRow>({
    sort: "-created",
    expand: "user",
    requestKey: null,
  });

  const ids = rows.map((r) => r.id);
  const [perms, entities] = await Promise.all([
    loadPermissionsForAssignments(adminPb, ids),
    loadEntitiesForAssignments(adminPb, ids),
  ]);

  const out: ModuleAssignmentAdminRow[] = [];
  for (const row of rows) {
    const moduleId = String(row.module_id);
    if (!isKnownModuleId(moduleId)) continue;
    const user = row.expand?.user;
    const entityRows = entities.get(row.id) ?? [];
    const customPermissions = perms.get(row.id) ?? [];
    const record = {
      id: row.id,
      userId: String(row.user),
      userName: String(user?.name || user?.email || row.user),
      userEmail: String(user?.email || ""),
      moduleId,
      moduleLabel: MODULE_REGISTRY[moduleId].label,
      accessMode: normalizeAccessMode(row.access_mode),
      entityScopeMode: normalizeEntityScopeMode(row.entity_scope_mode),
      deskEnabled: row.desk_enabled !== false,
      isActive: row.is_active !== false,
      customPermissions,
      entityCompanyIds: entityRows.map((e) => e.companyId),
      entityCompanyNames: entityRows.map((e) => e.name),
      notes: row.notes ? String(row.notes) : undefined,
      capabilityCount: 0,
    };
    const ctx = await previewAssignmentCapabilities(adminPb, record);
    record.capabilityCount = ctx.capabilityCount;
    out.push(record);
  }
  return out;
}

export async function previewAssignmentCapabilities(
  adminPb: PocketBase,
  row: Pick<
    ModuleAssignmentAdminRow,
    | "userId"
    | "moduleId"
    | "accessMode"
    | "entityScopeMode"
    | "deskEnabled"
    | "isActive"
    | "customPermissions"
    | "entityCompanyIds"
  >,
  options?: { activeCompanyId?: string | null },
): Promise<{
  capabilityCount: number;
  capabilityKeys: string[];
  derivedWebPaths: string[];
  entityCompanyIds: string[];
  entityCompanyNames: string[];
  workingCompanyId: string | null;
  workingCompanyName: string | null;
}> {
  const user = (await adminPb.collection("users").getOne(row.userId)) as Record<string, unknown>;
  const authorizedEntityIds = await listAccessibleCompanyIds(adminPb, row.userId, user);

  const assignment = {
    id: "preview",
    userId: row.userId,
    moduleId: row.moduleId,
    accessMode: row.accessMode,
    entityScopeMode: row.entityScopeMode,
    deskEnabled: row.deskEnabled,
    isActive: row.isActive,
    customPermissions: row.customPermissions,
    entityCompanyIds: row.entityCompanyIds,
  };

  const ctx = buildUserAccessContext(row.userId, row.isActive ? [assignment] : [], [], {
    authorizedEntityIds,
  });

  const scope = ctx.moduleEntityScope.get(row.moduleId);
  const companyIds = scope?.companyIds ?? [];
  const capabilityKeys = [...ctx.capabilityKeys].sort();
  const derivedWebPaths = [...ctx.webPathPrefixes].sort();

  const activeFromUser =
    options?.activeCompanyId !== undefined
      ? options.activeCompanyId
      : readActiveCompanyIdFromUser(user);
  const workingIds = resolveWorkingCompanyIds(companyIds, activeFromUser);
  const workingCompanyId = workingIds[0] ?? null;

  let companyNames: string[] = [];
  let workingCompanyName: string | null = null;
  if (companyIds.length) {
    const filter = companyIds.map((id) => `id = "${pbEscape(id)}"`).join(" || ");
    const companies = await adminPb.collection("biz_company_profile").getFullList<{
      id: string;
      company_name?: string;
      code?: string;
    }>({ filter, requestKey: null });
    const nameById = new Map(
      companies.map((c) => [c.id, String(c.company_name || c.code || c.id)]),
    );
    companyNames = companyIds.map((id) => nameById.get(id) || id);
    if (workingCompanyId) {
      workingCompanyName = nameById.get(workingCompanyId) || workingCompanyId;
    }
  }

  return {
    capabilityCount: capabilityKeys.length,
    capabilityKeys,
    derivedWebPaths,
    entityCompanyIds: companyIds,
    entityCompanyNames: companyNames,
    workingCompanyId,
    workingCompanyName,
  };
}

export function validateModuleAssignmentInput(
  input: ModuleAssignmentWriteInput,
  membershipCompanyIds: string[],
): { customPermissions: string[]; entityCompanyIds: string[] } {
  if (!input.userId?.trim()) throw new Error("Pengguna wajib dipilih.");
  if (!isKnownModuleId(input.moduleId)) throw new Error("Modul tidak valid.");
  if (input.accessMode !== "full" && input.accessMode !== "custom") {
    throw new Error("Mode akses tidak valid.");
  }
  if (input.entityScopeMode !== "all" && input.entityScopeMode !== "selected") {
    throw new Error("Scope entitas tidak valid.");
  }

  const catalog = new Set(listModulePermissionCatalog(input.moduleId));
  let customPermissions: string[] = [];

  if (input.accessMode === "custom") {
    customPermissions = (input.customPermissions ?? []).filter((k) => catalog.has(k));
    if (customPermissions.length === 0) {
      throw new Error("Mode CUSTOM memerlukan minimal satu akses yang dipilih.");
    }
    for (const key of customPermissions) {
      if (isOwnerOnlyModuleCapability(key)) {
        throw new Error(`Akses '${key}' hanya untuk Owner dan tidak dapat ditetapkan.`);
      }
    }
  }

  let entityCompanyIds: string[] = [];
  if (input.entityScopeMode === "selected") {
    entityCompanyIds = (input.entityCompanyIds ?? []).filter((id) =>
      membershipCompanyIds.includes(id),
    );
    if (entityCompanyIds.length === 0) {
      throw new Error("Pilih minimal satu entitas yang menjadi membership pengguna.");
    }
  }

  return { customPermissions, entityCompanyIds };
}

async function assertNoDuplicateActiveAssignment(
  adminPb: PocketBase,
  userId: string,
  moduleId: ModuleId,
  excludeId?: string,
): Promise<void> {
  let filter = `user = "${pbEscape(userId)}" && module_id = "${pbEscape(moduleId)}" && is_active = true`;
  if (excludeId) filter += ` && id != "${pbEscape(excludeId)}"`;
  const existing = await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).getFullList({
    filter,
    fields: "id",
    requestKey: null,
  });
  if (existing.length > 0) {
    throw new Error("Pengguna sudah memiliki penugasan aktif untuk modul ini.");
  }
}

async function replacePermissions(
  adminPb: PocketBase,
  assignmentId: string,
  keys: string[],
): Promise<void> {
  const existing = await adminPb.collection(MODULE_PERMISSIONS_COLLECTION).getFullList<{ id: string }>({
    filter: `assignment = "${pbEscape(assignmentId)}"`,
    fields: "id",
    requestKey: null,
  });
  for (const row of existing) {
    await adminPb.collection(MODULE_PERMISSIONS_COLLECTION).delete(row.id, { requestKey: null });
  }
  for (const key of keys) {
    await adminPb.collection(MODULE_PERMISSIONS_COLLECTION).create(
      { assignment: assignmentId, permission_key: key },
      { requestKey: null },
    );
  }
}

async function replaceEntities(
  adminPb: PocketBase,
  assignmentId: string,
  companyIds: string[],
): Promise<void> {
  const existing = await adminPb.collection(MODULE_ENTITIES_COLLECTION).getFullList<{ id: string }>({
    filter: `assignment = "${pbEscape(assignmentId)}"`,
    fields: "id",
    requestKey: null,
  });
  for (const row of existing) {
    await adminPb.collection(MODULE_ENTITIES_COLLECTION).delete(row.id, { requestKey: null });
  }
  for (const companyId of companyIds) {
    await adminPb.collection(MODULE_ENTITIES_COLLECTION).create(
      { assignment: assignmentId, company: companyId },
      { requestKey: null },
    );
  }
}

export async function createModuleAssignmentAdmin(
  adminPb: PocketBase,
  actorUserId: string,
  input: ModuleAssignmentWriteInput,
): Promise<string> {
  const membership = await listAccessibleCompanyIds(adminPb, input.userId);
  const { customPermissions, entityCompanyIds } = validateModuleAssignmentInput(input, membership);

  if (input.isActive) {
    await assertNoDuplicateActiveAssignment(adminPb, input.userId, input.moduleId);
  }

  const row = await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).create(
    {
      user: input.userId,
      module_id: input.moduleId,
      access_mode: input.accessMode,
      entity_scope_mode: input.entityScopeMode,
      desk_enabled: input.deskEnabled,
      is_active: input.isActive,
      granted_by: actorUserId,
      notes: input.notes?.trim() || "",
    },
    { requestKey: null },
  );

  const id = String(row.id);
  if (input.accessMode === "custom") {
    await replacePermissions(adminPb, id, customPermissions);
  }
  if (input.entityScopeMode === "selected") {
    await replaceEntities(adminPb, id, entityCompanyIds);
  }

  return id;
}

export async function updateModuleAssignmentAdmin(
  adminPb: PocketBase,
  assignmentId: string,
  input: ModuleAssignmentWriteInput,
): Promise<void> {
  const existing = (await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).getOne(assignmentId, {
    requestKey: null,
  })) as PbAssignmentRow;

  const membership = await listAccessibleCompanyIds(adminPb, input.userId);
  const { customPermissions, entityCompanyIds } = validateModuleAssignmentInput(input, membership);

  if (input.isActive) {
    await assertNoDuplicateActiveAssignment(adminPb, input.userId, input.moduleId, assignmentId);
  }

  await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).update(
    assignmentId,
    {
      user: input.userId,
      module_id: input.moduleId,
      access_mode: input.accessMode,
      entity_scope_mode: input.entityScopeMode,
      desk_enabled: input.deskEnabled,
      is_active: input.isActive,
      notes: input.notes?.trim() || "",
    },
    { requestKey: null },
  );

  if (input.accessMode === "custom") {
    await replacePermissions(adminPb, assignmentId, customPermissions);
  } else {
    await replacePermissions(adminPb, assignmentId, []);
  }

  if (input.entityScopeMode === "selected") {
    await replaceEntities(adminPb, assignmentId, entityCompanyIds);
  } else {
    await replaceEntities(adminPb, assignmentId, []);
  }
}

export async function deleteModuleAssignmentAdmin(
  adminPb: PocketBase,
  assignmentId: string,
): Promise<void> {
  await replacePermissions(adminPb, assignmentId, []);
  await replaceEntities(adminPb, assignmentId, []);
  await adminPb.collection(MODULE_ASSIGNMENTS_COLLECTION).delete(assignmentId, { requestKey: null });
}

export type ModuleAssignmentUserOption = {
  id: string;
  name: string;
  email: string;
  roleCode: string;
  companyIds: string[];
  companies: { id: string; name: string }[];
};

export async function listUsersForModuleAssignmentAdmin(
  adminPb: PocketBase,
): Promise<ModuleAssignmentUserOption[]> {
  const users = await adminPb.collection("users").getFullList<{
    id: string;
    name?: string;
    email?: string;
    role_code?: string;
    role?: string;
    account_type?: string;
  }>({
    filter: 'account_type = "user"',
    sort: "name",
    requestKey: null,
  });

  const companies = await adminPb.collection("biz_company_profile").getFullList<{
    id: string;
    company_name?: string;
    code?: string;
  }>({
    filter: "is_active = true",
    sort: "company_name",
    requestKey: null,
  });
  const companyNameById = new Map(
    companies.map((c) => [c.id, String(c.company_name || c.code || c.id)]),
  );

  const out: ModuleAssignmentUserOption[] = [];
  for (const u of users) {
    const companyIds = await listAccessibleCompanyIds(adminPb, u.id, u as Record<string, unknown>);
    out.push({
      id: u.id,
      name: String(u.name || u.email || u.id),
      email: String(u.email || ""),
      roleCode: String(u.role_code || u.role || "staff"),
      companyIds,
      companies: companyIds.map((id) => ({ id, name: companyNameById.get(id) || id })),
    });
  }
  return out;
}
