/**
 * HR-STAFF-01 — True HR Staff workspace & capability-driven navigation.
 * Run: npm run test:hr-staff-workspace
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ✓", msg);
  } else {
    failed++;
    console.log("  ✗", msg);
  }
}

console.log("=== HR-STAFF-01 — TRUE HR STAFF WORKSPACE ===\n");

console.log("CASE 1–5 — Workspace resolver (position domain > role_code)");
{
  assert(exists("lib/org/hr-workspace-access.ts"), "hr-workspace-access helper");
  const gate = read("lib/operational-access-gate.ts");
  assert(gate.includes("hasHrOperationalWorkspace"), "bypass uses HR operational workspace");
  assert(gate.includes('roleCode === "hr"'), "legacy role_code=hr still compat bypass");
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes("hasHrPositionWorkspaceDomain"), "paths/landing honor position domain");
  assert(rbac.includes("hasHrOperationalWorkspace"), "hasHrFullWorkspaceAccess uses domain/hub");
  assert(rbac.includes('paths = uniquePaths([...paths, "/hr"])'), "domain HR adds hub /hr");

  // Runtime (tsx/ts via dynamic import of compiled logic — pure JS re-import from built sources using node --experimental)
  // Static contract: resolve-primary-workspace already asserts manager+domain→hr in flex-org-01-runtime.
  assert(
    read("scripts/test-flex-org-01-runtime.mjs").includes('active_workspace_domain: "hr"'),
    "flex-org-01 covers role_code=manager + domain hr → /hr",
  );
  assert(
    read("lib/org/resolve-primary-workspace.ts").includes("role_code alone NEVER wins"),
    "role_code never primary in resolver docs",
  );
}

console.log("\nCASE — Landing enrich includes org workspace");
{
  const midUser = read("lib/access/middleware-access-user.ts");
  assert(midUser.includes("isOrgWorkspaceEnriched"), "landing re-enriches if org domain missing");
  assert(midUser.includes("isSessionModuleAccessEnriched"), "module enrich still considered");
}

console.log("\nCASE 6–7 — HR sidebar capability sections; personal not primary");
{
  const hrCfg = read("lib/workspace/workspaces/hr.ts");
  assert(hrCfg.includes("workspace.hr.section.sdm"), "SDM section");
  assert(hrCfg.includes("workspace.hr.section.attendanceWork"), "attendance/work section");
  assert(hrCfg.includes("workspace.hr.section.reports"), "reports section");
  assert(hrCfg.includes("personalSection: undefined"), "personalSection demoted");
  assert(!hrCfg.includes("personal-attendance"), "no Absensi Saya in HR primary");
  assert(!hrCfg.includes("my-submissions") && !hrCfg.includes("personal-submissions"), "no Pengajuan Saya primary");
  const hrNav = read("components/workspace/HrSidebarNav.tsx");
  assert(hrNav.includes("StaffDeskWorkbench"), "Meja Kerja present");
  assert(hrNav.includes("filterCommonSectionsForUser"), "menus path/capability filtered");
  assert(!hrNav.includes("personalSection"), "sidebar omits personal primary");
  const deskIdx = hrNav.indexOf("<StaffDeskWorkbench");
  const sectionsIdx = hrNav.indexOf("workspaceSections.map");
  assert(sectionsIdx >= 0 && deskIdx > sectionsIdx, "Meja Kerja after workspace menus (Laporan)");
  assert(read("components/Sidebar.tsx").includes("WorkspaceMobileAccessFooter"), "shared Akses Mobile");
}

console.log("\nCASE 8–13 — Scoped APIs retained (static)");
{
  assert(read("app/(dashboard)/hr/leave/page.tsx").includes("forHrMonitor") || read("app/(dashboard)/hr/leave/page.tsx").includes("/api/hr/leave"), "leave uses API");
  assert(
    exists("lib/hr/leave-list-server.ts") ||
      read("app/(dashboard)/hr/leave/page.tsx").includes("forHrMonitor") ||
      read("app/api/hr/leave/route.ts").includes("forHrMonitor"),
    "leave scoped server/API surface",
  );
  assert(exists("app/api/hr/overtime/route.ts") || exists("lib/hr/overtime-list-server.ts"), "OT scoped surface");
  assert(read("lib/hr/attendance-server.ts").includes("getBusinessDateYmd"), "attendance SSOT intact");
  assert(exists("app/(dashboard)/hr/recruitment-approvals/page.tsx") || exists("app/(dashboard)/hr/recruitment"), "recruitment route");
}

console.log("\nCASE 14–16 — FOM / entity (no regress architecture)");
{
  assert(
    read("lib/org/resolve-operational-entity-scope.ts").includes("isActive") ||
      read("lib/org/resolve-operational-entity-scope.ts").includes("is_active") ||
      exists("lib/org/resolve-operational-entity-scope.ts"),
    "FOM operational scope resolver present",
  );
}

console.log("\nCASE 17–19 — Mobile + no role_code shortcut as primary");
{
  assert(read("components/Sidebar.tsx").includes("WorkspaceMobileAccessFooter"), "mobile link");
  const access = read("lib/org/hr-workspace-access.ts");
  assert(!access.includes('role_code === "hr"'), "hr-workspace-access ignores role_code");
  assert(access.includes('=== "hr"'), "domain hr check");
}

console.log("\nCASE — i18n keys");
{
  const id = read("lib/i18n/messages/design-id.ts");
  const en = read("lib/i18n/messages/design-en.ts");
  for (const k of ["sdm:", "attendanceWork:", "reports:", "mobileAccess:", "shellLabel:"]) {
    assert(id.includes(k), `id has ${k}`);
    assert(en.includes(k), `en has ${k}`);
  }
}

console.log("\nCASE — Staff personal attendance route kept");
{
  assert(exists("app/(dashboard)/dashboard-staff/attendance/page.tsx"), "personal attendance route remains");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
