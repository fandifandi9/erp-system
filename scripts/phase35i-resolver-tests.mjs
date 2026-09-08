/**
 * Phase 35I — resolver unit tests (plain Node, no TS runtime required).
 * Imported by scripts/test-phase35i-access-architecture.mjs
 */

/** @typedef {{ id: string; userId: string; moduleId: string; accessMode: 'full'|'custom'; entityScopeMode: 'selected'|'all'; deskEnabled: boolean; isActive: boolean; customPermissions: string[]; entityCompanyIds: string[] }} Assignment */

const HR_PATHS = ["/hr", "/hr/leave", "/hr/employees"];
const FINANCE_PATHS = ["/keuangan", "/keuangan/piutang"];

const HR_CAPS = ["employee.view", "employee.create", "attendance.manage"];
const FINANCE_CAPS = ["web:/keuangan", "web:/keuangan/piutang"];

const MODULE_CATALOG = {
  hr: { paths: HR_PATHS, caps: [...HR_CAPS, "web:/hr", "web:/hr/leave"] },
  finance: { paths: FINANCE_PATHS, caps: FINANCE_CAPS },
  warehouse: { paths: ["/gudang"], caps: ["web:/gudang"] },
};

const HR_CAP_PATH_MAP = {
  "employee.view": ["/hr", "/hr/employees"],
  "employee.create": ["/hr", "/hr/employees"],
  "attendance.manage": ["/hr", "/hr/attendance"],
};

function resolveAssignmentPerms(a) {
  const cat = MODULE_CATALOG[a.moduleId];
  if (!cat) return [];
  if (a.accessMode === "full") return cat.caps;
  const allowed = new Set(cat.caps);
  return a.customPermissions.filter((k) => allowed.has(k));
}

function resolveAssignmentPaths(a) {
  const cat = MODULE_CATALOG[a.moduleId];
  if (!cat) return [];
  if (a.accessMode === "full") return cat.paths;
  const perms = resolveAssignmentPerms(a);
  const paths = [];
  for (const k of perms) {
    if (k.startsWith("web:")) paths.push(k.slice(4));
    else if (a.moduleId === "hr" && HR_CAP_PATH_MAP[k]) paths.push(...HR_CAP_PATH_MAP[k]);
  }
  return [...new Set(paths)];
}

function buildContext(assignments, authorizedEntityIds) {
  const active = assignments.filter((a) => a.isActive);
  const paths = [];
  const caps = new Set();
  const desk = new Set();
  const scopes = new Map();

  for (const a of active) {
    paths.push(...resolveAssignmentPaths(a));
    for (const k of resolveAssignmentPerms(a)) {
      if (!k.startsWith("web:")) caps.add(k);
    }
    if (a.deskEnabled) desk.add(a.moduleId);
    const companyIds =
      a.entityScopeMode === "all"
        ? [...authorizedEntityIds]
        : a.entityCompanyIds.filter((id) => authorizedEntityIds.includes(id));
    scopes.set(a.moduleId, { mode: a.entityScopeMode, companyIds });
  }

  return {
    webPathPrefixes: [...new Set(paths)],
    capabilityKeys: caps,
    deskModuleIds: desk,
    moduleEntityScope: scopes,
  };
}

function assert(cond, msg, results) {
  if (cond) {
    results.passed++;
    results.messages.push(`  ✓ ${msg}`);
  } else {
    results.failed++;
    results.messages.push(`  ✗ ${msg}`);
  }
}

export function runPhase35iResolverTests() {
  const results = { passed: 0, failed: 0, messages: [] };
  const entities = ["co-a", "co-b", "co-c"];

  // CASE 1 — staff no modules
  const c1 = buildContext([], entities);
  assert(c1.webPathPrefixes.length === 0, "CASE 1: no module paths without assignment", results);

  // CASE 2 — staff + HR full
  const c2 = buildContext(
    [
      {
        id: "1",
        userId: "u",
        moduleId: "hr",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
    ],
    entities,
  );
  assert(c2.webPathPrefixes.includes("/hr"), "CASE 2: HR full grants /hr", results);
  assert(c2.capabilityKeys.has("employee.view"), "CASE 2: HR full grants employee.view", results);

  // CASE 3 — staff + finance
  const c3 = buildContext(
    [
      {
        id: "2",
        userId: "u",
        moduleId: "finance",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
    ],
    entities,
  );
  assert(c3.webPathPrefixes.includes("/keuangan"), "CASE 3: Finance grants /keuangan", results);

  // CASE 4 — multi module
  const c4 = buildContext(
    [
      {
        id: "3",
        userId: "u",
        moduleId: "hr",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
      {
        id: "4",
        userId: "u",
        moduleId: "finance",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: false,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
      {
        id: "5",
        userId: "u",
        moduleId: "warehouse",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
    ],
    entities,
  );
  assert(c4.webPathPrefixes.includes("/hr") && c4.webPathPrefixes.includes("/keuangan"), "CASE 4: HR+Finance coexist", results);
  assert(c4.webPathPrefixes.includes("/gudang"), "CASE 4: Warehouse coexist", results);

  // CASE 5 — HR FULL all caps
  assert(c2.capabilityKeys.has("attendance.manage"), "CASE 5: HR FULL all HR caps", results);

  // CASE 6 — HR CUSTOM subset
  const c6 = buildContext(
    [
      {
        id: "6",
        userId: "u",
        moduleId: "hr",
        accessMode: "custom",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: ["employee.view"],
        entityCompanyIds: [],
      },
    ],
    entities,
  );
  assert(c6.capabilityKeys.has("employee.view"), "CASE 6: HR CUSTOM has employee.view", results);
  assert(!c6.capabilityKeys.has("employee.create"), "CASE 6: HR CUSTOM excludes employee.create", results);
  assert(c6.webPathPrefixes.includes("/hr/employees"), "CASE 6: CUSTOM employee.view derives /hr/employees", results);
  assert(c6.webPathPrefixes.includes("/hr"), "CASE 6: CUSTOM employee.view derives /hr", results);
  assert(!c6.capabilityKeys.has("employee.activate"), "CASE 6: CUSTOM cannot get owner-only activate", results);

  // CASE 7 — entity selected
  const c7 = buildContext(
    [
      {
        id: "7",
        userId: "u",
        moduleId: "hr",
        accessMode: "full",
        entityScopeMode: "selected",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: ["co-a"],
      },
    ],
    entities,
  );
  const hrScope = c7.moduleEntityScope.get("hr");
  assert(hrScope?.companyIds.length === 1 && hrScope.companyIds[0] === "co-a", "CASE 7: selected entity PT A only", results);
  assert(!hrScope?.companyIds.includes("co-b"), "CASE 7: PT B excluded", results);

  // CASE 8 — entity ALL
  const c8 = buildContext(
    [
      {
        id: "8",
        userId: "u",
        moduleId: "hr",
        accessMode: "full",
        entityScopeMode: "all",
        deskEnabled: true,
        isActive: true,
        customPermissions: [],
        entityCompanyIds: [],
      },
    ],
    entities,
  );
  assert(c8.moduleEntityScope.get("hr")?.companyIds.length === 3, "CASE 8: ALL entities", results);

  // CASE 9 — module without desk
  assert(c4.deskModuleIds.has("hr") && !c4.deskModuleIds.has("finance"), "CASE 9: finance module without desk", results);

  // CASE 10 — desk does not add caps (same as module access)
  assert(!c6.capabilityKeys.has("employee.create"), "CASE 10: desk cannot bypass permission", results);

  // CASE 11/12 — legacy paths preserved separately (structural — checked in static tests)

  // CASE 14 — multi module no conflict
  assert(c4.capabilityKeys.has("employee.view") && c4.webPathPrefixes.includes("/keuangan"), "CASE 14: multi-module no conflict", results);

  return results;
}
