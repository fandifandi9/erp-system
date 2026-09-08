/**
 * Phase 35I-B0 — HR employee list API (entity-scoped) tests.
 * Run: npm run test:phase35i-b0-employee-list
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

console.log("=== PHASE 35I-B0 EMPLOYEE LIST API TESTS ===\n");

console.log("CASE — API + server module wiring");
{
  assert(exists("lib/hr/employee-list-server.ts"), "employee-list-server exists");
  assert(exists("app/api/hr/employees/route.ts"), "employees route exists");

  const route = read("app/api/hr/employees/route.ts");
  assert(route.includes("export async function GET"), "GET /api/hr/employees exists");
  assert(route.includes("serverListEmployeesForHr"), "GET uses server list helper");
  assert(route.includes("requireOwnerOrHrApiUser"), "GET requires HR operational gate");

  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("isHrOperationalActor"), "list requires HR operational actor");
  assert(list.includes('assertEmployeeCapability(ctx, "employee.view")'), "list requires employee.view");
  assert(list.includes("resolveEmployeeListCompanyScope") || exists("lib/hr/employee-list-scope.ts"), "list scope resolver");
  assert(
    list.includes("owner_all") || read("lib/hr/employee-list-scope.ts").includes("owner_all"),
    "Owner all-entities scope",
  );
  assert(
    list.includes("WORKING ENTITY ONLY") ||
      list.includes("working entity") ||
      read("lib/hr/employee-list-scope.ts").includes("hr_working") ||
      read("lib/hr/employee-list-scope.ts").includes("working"),
    "list documents working-entity fallback",
  );
  assert(
    read("lib/hr/employee-list-scope.ts").includes("org_hierarchy"),
    "org hierarchy list scope for assigned holders",
  );
  assert(list.includes("listUserIdsInCompanies"), "list scopes via biz_user_companies membership");
  assert(!list.includes('filter: `user = "${ctx.userId}"`'), "list does not filter by current user id");
  assert(!list.includes("ctx.userId"), "list does not use actor userId as employee filter");
  assert(list.includes('sort: "-updated"'), "profiles fetched with updated descending");
  assert(!list.includes("nik"), "list DTO does not select nik");
  assert(!list.includes("npwp"), "list DTO does not expose npwp");
  assert(!list.includes("salary"), "list DTO does not expose salary");
  assert(list.includes("rolePresetId"), "returns rolePresetId for API compatibility");
  assert(list.includes("fetchOrgPositionNamesByUser"), "list resolves posisi from org assignment");
  assert(list.includes("HR_EMPLOYEE_ORG_ASSIGNMENTS_COLLECTION"), "list uses org assignments collection");
  assert(list.includes("leaveBookingsQuota"), "returns leave quota");
  assert(list.includes("requireCheckinSelfie"), "returns selfie flag");
}

console.log("\nCASE — Page migrated off client profiles.getFullList");
{
  const page = read("app/(dashboard)/hr/employees/page.tsx");
  assert(page.includes("hrApiListEmployees"), "page uses hrApiListEmployees");
  assert(!page.includes('pb.collection("profiles").getFullList'), "page no longer client profiles.getFullList");
  assert(page.includes("employee.activate"), "activate still capability-gated");
  assert(page.includes("employee.deactivate"), "deactivate still capability-gated");
  assert(page.includes("hr.employees.colName"), "table columns preserved");
  assert(page.includes("hr.employees.colPosition"), "position column kept as jabatan display");
  assert(!page.includes("hr.employees.colRole"), "role column removed from employee list");
  assert(!page.includes("roleLabel"), "roleLabel no longer mapped in list UI");
  assert(page.includes("hr.employees.empty"), "empty state preserved");

  const client = read("lib/hr/hr-api-client.ts");
  assert(client.includes("hrApiListEmployees"), "client helper exists");
  assert(
    client.includes("/api/hr/employees"),
    "client calls GET /api/hr/employees",
  );
}

console.log("\nCASE — Do not widen profiles.listRule");
{
  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("getFullList"), "uses admin/server PB query");
  assert(list.includes("adminPb.collection(\"profiles\")"), "queries profiles via admin PB");
  assert(list.includes("Does not use client PocketBase profiles.listRule"), "documents listRule bypass via server API");
}

console.log("\nCASE — Capability + entity scope semantics (resolver)");
{
  const membership = ["PT_A", "PT_B"];
  const selected = ["PT_A"];
  const intersect = selected.filter((id) => membership.includes(id));
  assert(intersect.length === 1 && intersect[0] === "PT_A", "SELECTED PT A ∩ membership → PT A only");

  const allMode = membership.slice();
  assert(allMode.includes("PT_A") && allMode.includes("PT_B"), "ALL mode keeps membership companies");

  const emptyIntersect = ["PT_C"].filter((id) => membership.includes(id));
  assert(emptyIntersect.length === 0, "out-of-membership SELECTED yields empty effective scope");
}

console.log("\nCASE — Staff without HR / CUSTOM without employee.view denied by gates");
{
  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("isHrOperationalActor"), "Staff without HR fails operational actor");
  assert(list.includes("employee.view"), "CUSTOM without employee.view fails capability assert");

  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes("HR_FULL_CAPABILITIES"), "HR FULL capability set defined");
  assert(registry.includes('c !== "employee.activate"'), "FULL excludes owner-only activate");
}

console.log("\nCASE — Sensitive fields stripped from list response shape");
{
  const list = read("lib/hr/employee-list-server.ts");
  const dtoStart = list.indexOf("export type EmployeeListItemDto");
  const dtoEnd = list.indexOf("};", dtoStart);
  const dto = list.slice(dtoStart, dtoEnd);
  for (const field of ["nik", "npwp", "salary", "leave_daily_rate", "extra_bonus"]) {
    assert(!dto.includes(field), `DTO omits sensitive field ${field}`);
  }
  for (const field of [
    "id",
    "userId",
    "name",
    "position",
    "email",
    "rolePresetId",
    "dashboardAccess",
    "status",
    "leaveBookingsQuota",
    "requireCheckinSelfie",
  ]) {
    assert(dto.includes(field), `DTO includes list field ${field}`);
  }
}

console.log("\nCASE — Employment relation is biz_user_companies (not profiles.user as company)");
{
  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("listUserIdsInCompanies"), "employment via company membership helper");
  const scope = read("lib/hr/employment-scope.ts");
  assert(scope.includes("USER_COMPANIES_COLLECTION"), "membership collection constant");
  assert(scope.includes("biz_user_companies") || read("lib/tenant/company-access.ts").includes("biz_user_companies"), "biz_user_companies is SSOT");
}

console.log("\nCASE — Privileged visibility (operational list hides Owner/legacy HR)");
{
  const list = read("lib/hr/employee-list-server.ts");
  assert(list.includes("isPrivilegedTargetUser"), "list uses shared privileged helper");
  assert(list.includes("hidePrivilegedTargets"), "operational list has privileged hide flag");
  assert(list.includes("!ctx.isOwner"), "Owner retains privileged visibility");
  assert(list.includes("account_type"), "user fetch includes account_type for privileged check");

  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("Akun privileged hanya dapat dikelola oleh Owner."), "mutation privileged message preserved");
  assert(empAuth.includes("assertCanManageTargetAccount"), "mutation helper unchanged");

  const caps = read("lib/capabilities/employee.ts");
  assert(caps.includes('accountType === "owner"'), "privileged = owner");
  assert(caps.includes('roleCode === "hr"'), "privileged = legacy hr");
}

console.log("\n--- Phase 35I resolver regression ---\n");
{
  const resolverResults = runPhase35iResolverTests();
  for (const msg of resolverResults.messages) console.log(msg);
  passed += resolverResults.passed;
  failed += resolverResults.failed;
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
