/**
 * Phase 35I-B0 FIX — HR module access consistency tests.
 * Run: npm run test:phase35i-b0-fix-hr-access
 */

import fs from "fs";
import path from "path";
import { runPhase35iResolverTests } from "./phase35i-resolver-tests.mjs";

const root = process.cwd();
let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== PHASE 35I-B0 FIX HR ACCESS TESTS ===\n");

console.log("CASE 1–2 — Staff + HR FULL web surface uses canAccess (not legacy HR role only)");
{
  const suspicious = read("app/(dashboard)/hr/attendance/suspicious/page.tsx");
  assert(suspicious.includes("canAccessHrWebSurface"), "suspicious uses module-aware guard");
  assert(!suspicious.includes("isOwnerOrHrAccount"), "suspicious no legacy-only guard");
  assert(suspicious.includes('"/hr/attendance/suspicious"'), "suspicious checks exact path");

  const leaveSettings = read("app/(dashboard)/hr/leave/settings/page.tsx");
  assert(leaveSettings.includes("canAccessHrWebSurface"), "leave settings module-aware");
}

console.log("\nCASE 3 — Owner-only caps not implied by page guards");
{
  const employees = read("app/(dashboard)/hr/employees/page.tsx");
  assert(employees.includes("employee.activate"), "activate still capability-gated");
  assert(employees.includes("employee.deactivate"), "deactivate still capability-gated");
  assert(!employees.includes("isOwnerOrHrAccount"), "employees list not legacy-only");
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c !== "employee.manage_hr_accounts"'), "FULL HR excludes manage_hr_accounts");
}

console.log("\nCASE 4–5 — Legacy HR + Owner paths unchanged in rbac");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes('hr: uniquePaths(['), "legacy HR role paths preserved");
  assert(rbac.includes('if (rules.includes("*")) return true'), "owner wildcard preserved");
}

console.log("\nCASE 6 — Entity scope intersection (static)");
{
  const entity = read("lib/access/entity-scope.ts");
  assert(entity.includes("authorizedEntityIds.includes"), "SELECTED scope intersects membership");
}

console.log("\nCASE 7–9 — desk_enabled visibility only");
{
  const desk = read("lib/access/desk-config.ts");
  assert(desk.includes("deskModuleIds"), "desk reads desk_enabled ids");
  assert(desk.includes("filterDeskItemsForUser"), "desk items filtered by capability + path");
  const resolver = read("lib/workspace/resolve-workspace.ts");
  assert(resolver.includes("resolveDeskModulesFromAccessContext"), "desk separated from full module");
}

console.log("\nCASE 10 — Meja Kerja has no Buka HR Lengkap (workspace already scoped)");
{
  const workbench = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(!workbench.includes("fullModuleHref"), "no full-module CTA in Meja Kerja");
  assert(workbench.includes("<Link"), "desk quick actions stay Link same-tab");
}

console.log("\nCASE 11 — Internal staff links same-tab");
{
  const staffNav = read("components/workspace/StaffSidebarNav.tsx");
  assert(staffNav.includes("<Link"), "staff sidebar internal Link");
  assert(!staffNav.includes('target="_blank"'), "staff sidebar no blank targets");
}

console.log("\nCASE 12 — startTime undefined safe parsing");
{
  const client = read("lib/hr/attendance-today-client.ts");
  assert(client.includes("parseTodayAttendanceResponse"), "today API parser exists");
  assert(client.includes("formatScheduleTimeRange"), "schedule label helper exists");
  const rail = read("components/workspace/StaffWorkspaceRail.tsx");
  assert(rail.includes("parseTodayAttendanceResponse"), "rail uses parser");
  assert(rail.includes("formatScheduleTimeRange"), "rail uses safe schedule formatter");
  const engine = read("lib/hr/attendance-engine.ts");
  assert(engine.includes("if (!schedule)"), "buildScheduleSnapshot guards missing schedule");
}

console.log("\nCASE — HR web helper exported");
{
  assert(read("lib/access/hr-web-access.ts").includes("canAccessHrWebSurface"), "hr-web-access helper");
  const employeesDetail = read("app/(dashboard)/hr/employees/[id]/page.tsx");
  assert(employeesDetail.includes("canAccessEmployeeManagement"), "employee detail page access");
  assert(
    employeesDetail.includes("canManageHrOptions") && employeesDetail.includes("canUpdateEmployee"),
    "HR options use update cap not role",
  );
  assert(employeesDetail.includes("hrApiGetEmployee"), "detail loads via server API");
  assert(employeesDetail.includes("hrApiPatchEmployee"), "detail saves via server API");
}

console.log("\nCASE 13 — Middleware server-side module path resolution (new tab / hard refresh)");
{
  const mw = read("middleware.ts");
  assert(mw.includes("resolveMiddlewareAuthUserForPath"), "middleware resolves auth from server data");
  assert(mw.includes("applyPbAuthCookie"), "middleware refreshes enriched cookie when needed");
  assert(mw.includes("export async function middleware"), "middleware is async for DB enrichment");

  const resolver = read("lib/access/middleware-access-user.ts");
  assert(resolver.includes("enrichUserWithAccessContext"), "uses authoritative session enrichment");
  assert(resolver.includes("readModuleWebPathsFromUser"), "checks enriched path count before skip");
  assert(resolver.includes("canAccess(authUser"), "lazy enrich only when base RBAC denies path");
  assert(resolver.includes("isOwnerAccount"), "owner bypass preserved");
  assert(!resolver.includes("desk_enabled"), "middleware does not trust desk_enabled for access");
}

console.log("\nCASE 14 — Staff+HR sidebar uses /hr/* (not /staff/* alias)");
{
  const nav = read("lib/wms/navigation.ts");
  assert(nav.includes("SDM_HR_OPERATIONAL_NAV_ITEMS"), "HR operational nav items defined");
  assert(nav.includes('href: "/hr/leave"'), "Cuti links to /hr/leave");
  assert(nav.includes('href: "/hr/employees"'), "Karyawan links to /hr/employees");
  assert(nav.includes('href: "/hr/attendance"'), "Absensi links to /hr/attendance");
  assert(nav.includes('href: "/hr/attendance/suspicious"'), "Suspicious links to /hr path");
  assert(nav.includes("SDM_HR_OPERATIONAL_NAV_ITEMS"), "HR nav uses /hr operational items");

  const hrNavBlock = nav.slice(
    nav.indexOf("SDM_NAV_ITEMS_HR"),
    nav.indexOf("KINERJA_NAV_ITEMS"),
  );
  assert(!hrNavBlock.includes("SDM_OPERATIONAL_NAV_ITEMS"), "SDM_NAV_ITEMS_HR no longer spreads /staff/* items");

  const sidebar = read("components/Sidebar.tsx");
  assert(sidebar.includes("SDM_NAV_ITEMS_HR"), "sidebar imports HR SDM nav");
  assert(!sidebar.includes("isHr ? SDM_NAV_ITEMS_HR : SDM_NAV_ITEMS"), "no staff-alias SDM for module HR");
  assert(sidebar.includes("canManageHr"), "SDM section still gated by canManageHr");

  const rbac = read("lib/rbac.ts");
  const staffBlock = rbac.slice(rbac.indexOf('staff: uniquePaths'), rbac.indexOf('"staff-basic"'));
  assert(!staffBlock.includes('"/staff/'), "staff RBAC does not add /staff/* paths");
}

console.log("\nCASE 15 — Client layout enrichment before redirect");
{
  const layout = read("app/(dashboard)/layout.tsx");
  assert(layout.includes("clientCanAccessPath"), "layout uses client route access helper");
  assert(layout.includes("refreshClientAccessSession"), "layout refreshes enriched session");
  assert(layout.includes("shouldRefreshClientAccessSession"), "layout avoids premature redirect");
  assert(layout.includes("routeEnrichAttemptRef"), "layout prevents infinite refresh loop");

  const clientAccess = read("lib/access/client-route-access.ts");
  assert(clientAccess.includes("restoreAuthFromHttpOnlyCookie"), "client refresh uses session API");

  const ctx = read("lib/access/context.ts");
  assert(ctx.includes("bestPathCount"), "resolveClientAccessUser prefers non-empty module_web_paths");
}

console.log("\nCASE 16 — Team attendance uses effective capability + entity intersect");
{
  const attAuth = read("lib/hr/attendance-auth.ts");
  assert(attAuth.includes("hasEffectiveAttendanceCapability"), "attendance auth exposes effective helper");
  assert(attAuth.includes("hasEffectiveCapability"), "attendance uses additive capability resolver");

  const att = read("lib/hr/attendance-server.ts");
  assert(att.includes("hasEffectiveAttendanceCapability(ctx, \"attendance.manage\")"), "list uses effective manage");
  assert(att.includes("hasEffectiveAttendanceCapability(ctx, \"attendance.view_team\")"), "list uses effective view_team");
  assert(att.includes("getHrWorkingCompanyIds"), "attendance list/correct uses working company ids");
  assert(att.includes("actorAttendanceCompanyIds"), "attendance scopes via actorAttendanceCompanyIds");
  assert(!att.includes("hasAttendanceCapability("), "team attendance no longer uses role-only helper");
  assert(att.includes("assertAttendanceCapability(ctx, \"attendance.manage\""), "correction uses assertAttendanceCapability");

  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c === "attendance.view_team"'), "HR FULL grants attendance.view_team");
  assert(registry.includes('c === "attendance.manage"'), "HR FULL grants attendance.manage");

  const rbac = read("lib/rbac.ts");
  const staffBlock = rbac.slice(rbac.indexOf("staff: uniquePaths"), rbac.indexOf('"staff-basic"'));
  assert(!staffBlock.includes('"/hr/attendance"'), "staff RBAC still excludes /hr/attendance");
}

console.log("\nCASE 17 — Rating admin uses assertHrAdminSurface + working entity scope");
{
  const rating = read("lib/hr/rating-server.ts");
  assert(rating.includes("assertHrAdminSurface"), "rating admin uses FULL surface guard");
  assert(rating.includes("getHrWorkingCompanyIds"), "rating subject scope uses working companies");
  assert(rating.includes("assertNotSelfRatingSubject"), "self-rating helper exists");
  assert(!rating.includes("ctx.isHr"), "legacy ctx.isHr removed from rating-server");
  assert(rating.includes("assertHrAdminSurface(ctx)"), "periods/assignments gated by admin surface");

  const enforcement = read("lib/access/hr-api-enforcement.ts");
  assert(enforcement.includes('assignment?.accessMode === "full"'), "CUSTOM denied on admin surface unless FULL");
}

console.log("\nCASE 18 — Employee list uses server API + employee.view + working entity scope");
{
  const route = read("app/api/hr/employees/route.ts");
  assert(route.includes("export async function GET"), "GET /api/hr/employees");
  assert(route.includes("serverListEmployeesForHr"), "GET delegates to list server");

  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes('assertEmployeeCapability(ctx, "employee.view")'), "employee.view required");
  assert(list.includes("getHrEffectiveCompanyIds"), "authorized entity scope (ALL/SELECTED)");
  assert(!list.includes("getHrWorkingCompanyIds"), "employee list not limited to working entity");
  assert(list.includes("listUserIdsInCompanies"), "employment membership filter");

  const page = read("app/(dashboard)/hr/employees/page.tsx");
  assert(page.includes("hrApiListEmployees"), "employees page uses list API");
  assert(!page.includes('pb.collection("profiles").getFullList'), "no client profiles list");
}

console.log("\n--- Phase 35I resolver regression ---\n");
runPhase35iResolverTests(assert);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
