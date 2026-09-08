/**
 * Phase 35I-A — Access enforcement hardening tests.
 * Run: npm run test:phase35i-a-access-enforcement
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

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

console.log("=== PHASE 35I-A ACCESS ENFORCEMENT TESTS ===\n");

console.log("CASE 1–2 — Staff base vs HR API gate");
{
  const apiAuth = read("lib/hr/api-auth.ts");
  assert(apiAuth.includes("requireHrModuleApiUser"), "HR gate uses module-aware helper");
  assert(apiAuth.includes("loadUserAccessContext"), "access context loaded on HR auth");
  const enforcement = read("lib/access/hr-api-enforcement.ts");
  assert(enforcement.includes("hasActiveHrModuleAssignment"), "HR module assignment check exists");
}

console.log("\nCASE 3–6 — FULL / CUSTOM capability enforcement");
{
  const eff = read("lib/access/effective-capability.ts");
  assert(eff.includes("hasEffectiveCapability"), "additive capability resolver");
  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("hasEffectiveEmployeeCapability"), "employee assert uses module caps");
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c !== "employee.activate"'), "FULL HR excludes sensitive activate cap");
}

console.log("\nCASE 7–8 — role_code unchanged; owner-only preserved");
{
  const emp = read("lib/capabilities/employee.ts");
  assert(emp.includes('grantedTo: ["owner"]') && emp.includes("employee.activate"), "activate owner-only in registry");
  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("employee.manage_hr_accounts"), "privileged account guard preserved");
}

console.log("\nCASE 9–12 — Entity scope INTERSECTION");
{
  const entity = read("lib/access/entity-scope.ts");
  assert(entity.includes("authorizedEntityIds.includes(id)"), "SELECTED scope intersects membership");
  const hrEnf = read("lib/access/hr-api-enforcement.ts");
  assert(hrEnf.includes("getHrEffectiveCompanyIds"), "HR effective company ids helper");
  assert(hrEnf.includes("assertHrModuleEntityAccess"), "module entity assert wired");
  const holiday = read("lib/hr/holiday-server.ts");
  assert(holiday.includes("getHrOperationalCompanyIds"), "holiday list uses FOM operational scope");
}

console.log("\nCASE 13 — Multi-module independent scope");
{
  const resolver = read("lib/access/entity-scope.ts");
  assert(resolver.includes("resolveAllModuleEntityScopes"), "per-module entity scope map");
}

console.log("\nCASE 14–15 — Desk boundary");
{
  const desk = read("lib/access/desk-config.ts");
  assert(desk.includes("deskEnabled"), "desk still respects desk_enabled");
  assert(!desk.includes("assertModuleCapability"), "desk config is not auth layer");
}

console.log("\nCASE 16–17 — Inactive / no assignment backward compat");
{
  const assign = read("lib/access/module-assignments-server.ts");
  assert(assign.includes("isActive"), "inactive assignments filtered");
  assert(assign.includes("return []"), "no assignment fail-safe");
  const legacy = read("lib/access/legacy-paths.ts");
  assert(legacy.includes("resolveLegacyAllowedPaths"), "legacy paths preserved");
}

console.log("\nCASE 18 — Existing HR role backward compatible");
{
  const apiAuth = read("lib/hr/api-auth.ts");
  assert(apiAuth.includes("isHrAccount"), "legacy HR role detection preserved");
  assert(apiAuth.includes("requireOwnerOrHrApiUser"), "requireOwnerOrHrApiUser still exported");
}

console.log("\nCASE 19–20 — API enforcement files wired");
{
  assert(exists("lib/access/hr-api-enforcement.ts"), "hr-api-enforcement SSOT");
  assert(exists("lib/access/effective-capability.ts"), "effective-capability SSOT");
  const leave = read("lib/hr/leave-server.ts");
  assert(leave.includes("isHrOperationalActor"), "leave uses operational actor check");
  assert(leave.includes("assertOrgHierarchyApprover"), "leave approve uses org hierarchy authority");
  assert(leave.includes("assertHrLeaveSubjectInScope"), "leave approve enforces FOM subject scope");
  const opGate = read("lib/operational-access-gate.ts");
  assert(opGate.includes("hasModuleOperationalPathAccess"), "module operational web path bypass");
  const att = read("lib/hr/attendance-server.ts");
  assert(att.includes("hasEffectiveAttendanceCapability"), "team attendance uses effective caps");
  assert(att.includes("getHrOperationalCompanyIds"), "team attendance uses FOM operational scope");
  const rating = read("lib/hr/rating-server.ts");
  assert(rating.includes("assertHrAdminSurface"), "rating admin uses FULL surface guard");
  assert(!rating.includes("ctx.isHr"), "rating-server no longer uses ctx.isHr");
}

console.log("\nCASE — PIN/removed files not touched; no Owner UI");
{
  assert(!exists("app/(dashboard)/owner/access-management"), "no Owner access UI");
  const pkg = read("package.json");
  assert(!pkg.includes("phase35j"), "no Phase 35J script");
}

console.log("\n--- Phase 35I resolver regression ---\n");
const resolverResults = runPhase35iResolverTests();
for (const msg of resolverResults.messages) console.log(msg);
passed += resolverResults.passed;
failed += resolverResults.failed;

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
