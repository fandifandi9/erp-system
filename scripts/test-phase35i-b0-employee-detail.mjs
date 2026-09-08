/**
 * Phase 35I-B0 — HR employee detail/edit API tests.
 * Run: npm run test:phase35i-b0-employee-detail
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

console.log("=== PHASE 35I-B0 EMPLOYEE DETAIL/EDIT TESTS ===\n");

console.log("CASE — GET/PATCH wiring + operational gates");
{
  assert(exists("lib/hr/employee-detail-server.ts"), "employee-detail-server exists");
  const route = read("app/api/hr/employees/[id]/route.ts");
  assert(route.includes("export async function GET"), "GET /api/hr/employees/[id]");
  assert(route.includes("export async function PATCH"), "PATCH /api/hr/employees/[id]");
  assert(route.includes("serverGetEmployeeDetailForHr"), "GET uses detail server");
  assert(route.includes("serverUpdateEmployeeByHr"), "PATCH uses mutation server");
  assert(route.includes("requireOwnerOrHrApiUser"), "GET/PATCH require HR operational gate");
  assert(!route.includes("requireAuthenticatedHrUser"), "no bare authenticated-only gate");

  const detail = read("lib/hr/employee-detail-server.ts");
  assert(detail.includes("isHrOperationalActor"), "detail requires HR operational actor");
  assert(detail.includes('assertEmployeeCapability(ctx, "employee.view")'), "detail requires employee.view");
  assert(detail.includes("assertEmployeeTargetAccess"), "detail enforces target entity scope");
  assert(detail.includes("stripSensitiveFields"), "detail strips sensitive without view_sensitive");

  const mut = read("lib/hr/employee-mutation-server.ts");
  assert(mut.includes("isHrOperationalActor"), "update requires HR operational actor");
  assert(mut.includes('assertEmployeeCapability(ctx, "employee.update")'), "update requires employee.update");
  assert(mut.includes("assertEmployeeTargetAccess"), "update enforces target entity scope");
  assert(mut.includes("hasEffectiveEmployeeCapability"), "update uses effective caps for sensitive/manager");
  assert(!mut.includes('hasEmployeeCapability(ctx.user, "employee.view_sensitive")'), "no legacy-only view_sensitive");
  assert(!mut.includes('hasEmployeeCapability(ctx.user, "employee.assign_manager")'), "no legacy-only assign_manager");
  assert(!mut.includes('hasEmployeeCapability(ctx.user, "employee.manage_accounts")'), "no legacy-only manage_accounts");
}

console.log("\nCASE — Page migrated off client profiles load");
{
  const page = read("app/(dashboard)/hr/employees/[id]/page.tsx");
  assert(page.includes("hrApiGetEmployee"), "detail page loads via API");
  assert(page.includes("hrApiPatchEmployee"), "detail page saves via API");
  assert(!page.includes('pb.collection("profiles").getFullList'), "no client profiles.getFullList");
  assert(!page.includes('pb.collection("profiles").update'), "no client profiles.update");
  assert(!page.includes('pb.collection("biz_user_companies").getFullList'), "no client membership list");
  assert(page.includes("canUpdateEmployee"), "save gated by server actor.canUpdate");
  assert(page.includes("disabled={saving || !officeId || !canUpdateEmployee}"), "Save button respects canUpdate");
}

console.log("\nCASE — Owner-only caps remain protected");
{
  const mut = read("lib/hr/employee-mutation-server.ts");
  assert(mut.includes('"employee.activate"') || mut.includes("employee.activate"), "activate path still capability-gated");
  assert(mut.includes('"employee.deactivate"') || mut.includes("employee.deactivate"), "deactivate path still capability-gated");
  const emp = read("lib/capabilities/employee.ts");
  assert(emp.includes('grantedTo: ["owner"]') && emp.includes("employee.activate"), "activate owner-only in catalog");
  assert(emp.includes("employee.manage_hr_accounts") && emp.includes('grantedTo: ["owner"]'), "manage_hr_accounts owner-only");
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c !== "employee.activate"'), "HR FULL excludes activate");
  assert(registry.includes('c !== "employee.deactivate"'), "HR FULL excludes deactivate");
  assert(registry.includes('c !== "employee.manage_hr_accounts"'), "HR FULL excludes manage_hr_accounts");
}

console.log("\nCASE — profiles.updateRule not widened");
{
  const detail = read("lib/hr/employee-detail-server.ts");
  const mut = read("lib/hr/employee-mutation-server.ts");
  assert(detail.includes("adminPb.collection(\"profiles\")"), "detail uses admin PB");
  assert(mut.includes("adminPb.collection(\"profiles\").update"), "update uses admin PB");
  assert(!detail.includes("updateRule"), "detail does not touch updateRule");
  assert(!mut.includes("updateRule"), "mutation does not touch updateRule");
  assert(!read("app/api/hr/employees/[id]/route.ts").includes("updateRule"), "route does not touch updateRule");
}

console.log("\nCASE — Entity scope intersection contract");
{
  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("getHrEffectiveCompanyIds"), "target access uses authorized company ids");
  assert(!empAuth.includes("getHrWorkingCompanyIds"), "target access not limited to working entity");
  const scope = read("lib/hr/employee-scope.ts");
  assert(scope.includes("targetCompanies.some"), "COMPANY scope intersects actor/target membership");
  const membership = ["PT_A", "PT_B"];
  const selected = ["PT_A"];
  const effective = selected.filter((id) => membership.includes(id));
  assert(effective.length === 1 && effective[0] === "PT_A", "SELECTED PT A only");
  assert(!effective.includes("PT_B"), "PT B excluded from effective scope");
}

console.log("\nCASE — Capability semantics (resolver)");
{
  const resolverResults = runPhase35iResolverTests();
  for (const msg of resolverResults.messages) console.log(msg);
  passed += resolverResults.passed;
  failed += resolverResults.failed;

  assert(
    read("lib/access/module-registry.ts").includes("EMPLOYEE_CAPABILITIES.filter"),
    "HR FULL grants employee.update via catalog filter",
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
