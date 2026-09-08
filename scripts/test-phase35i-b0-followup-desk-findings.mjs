/**
 * Phase 35I-B0 Follow-up — Meja Kerja workbench + findings authorization.
 * Run: npm run test:phase35i-b0-followup-desk-findings
 */

import fs from "fs";
import path from "path";

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

console.log("=== PHASE 35I-B0 FOLLOW-UP DESK + FINDINGS TESTS ===\n");

console.log("CASE 1 — Staff without HR cannot reach /hr (static rbac)");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes('staff: uniquePaths(["/dashboard-staff"'), "staff base paths exclude /hr");
  assert(rbac.includes("module_web_paths"), "module paths additive only");
}

console.log("\nCASE 2 — Staff + HR FULL paths include findings");
{
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('"/hr/findings"'), "findings in HR FULL web paths");
}

console.log("\nCASE 3 — Findings API uses module-aware actor (not ctx.isHr only)");
{
  const reporting = read("lib/hr/reporting-server.ts");
  assert(reporting.includes("isHrReportingActor"), "reporting uses HR operational actor");
  assert(reporting.includes("isHrOperationalActor"), "wired to Phase 35I-A helper");
  assert(reporting.includes("getHrWorkingCompanyIds"), "entity scope on reporting");
  assert(!reporting.includes("ctx.isHr"), "legacy ctx.isHr removed from reporting-server");
}

console.log("\nCASE 4 — Entity scope INTERSECT preserved");
{
  const hrEnf = read("lib/access/hr-api-enforcement.ts");
  assert(hrEnf.includes("moduleScope.companyIds.filter((id) => membership.includes(id))"), "intersection");
}

console.log("\nCASE 5–6 — desk_enabled visibility only");
{
  const desk = read("lib/access/desk-config.ts");
  assert(desk.includes("deskModuleIds"), "desk_enabled controls visibility");
  assert(desk.includes("filterDeskItemsForUser"), "capability-aware desk items");
  const resolver = read("lib/workspace/resolve-workspace.ts");
  assert(resolver.includes("resolveDeskModulesFromAccessContext"), "desk separate from full module");
}

console.log("\nCASE 7 — Owner-only caps unchanged");
{
  const ownerOnly = read("lib/access/owner-only-capabilities.ts");
  assert(ownerOnly.includes("employee.activate"), "activate owner-only");
  assert(ownerOnly.includes("employee.manage_hr_accounts"), "manage_hr_accounts owner-only");
}

console.log("\nCASE 8 — Legacy HR role preserved");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes('hr: uniquePaths(['), "legacy HR paths preserved");
}

console.log("\nCASE 9–10 — Meja Kerja action center (no Buka HR Lengkap)");
{
  const workbench = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(!workbench.includes("fullModuleHref"), "no full-module CTA");
  assert(workbench.includes("<Link"), "quick actions same-tab Link");
  assert(
    workbench.includes("shouldShowDeskItem") || workbench.includes("actionItems"),
    "desk filters pending work",
  );
}

console.log("\nCASE 11 — Attendance startTime guards preserved");
{
  const client = read("lib/hr/attendance-today-client.ts");
  assert(client.includes("parseTodayAttendanceResponse"), "attendance parser exists");
  assert(client.includes("formatScheduleTimeRange"), "safe schedule formatter");
  const engine = read("lib/hr/attendance-engine.ts");
  assert(engine.includes("if (!schedule)"), "buildScheduleSnapshot guard");
}

console.log("\nCASE — Meja Kerja workbench structure");
{
  const workbench = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(workbench.includes("workspace.staff.desk.section.priority"), "priority section");
  assert(!workbench.includes("workspace.staff.desk.section.fullModule"), "no full module section in UI");
  assert(workbench.includes("desk-workbench-summary"), "HR task counts API");
  const deskModules = read("lib/workspace/desk-modules.ts");
  assert(deskModules.includes("summaryKey"), "desk items support badges");
  assert(deskModules.includes("requiredCapability"), "desk items capability-aware");
  assert(!deskModules.includes("/hr/rating"), "rating not in desk workbench");
}

console.log("\nCASE — Desk item filter uses existing capabilities");
{
  const filter = read("lib/workspace/desk-item-filter.ts");
  assert(filter.includes("hasEffectiveCapability"), "effective capability check");
  assert(filter.includes("canAccessEmployeeManagement"), "employees uses employee.view bridge");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
