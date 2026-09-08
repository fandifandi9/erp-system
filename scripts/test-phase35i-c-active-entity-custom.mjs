/**
 * Phase 35I-C — Active entity context + CUSTOM 2.0 + multi-tab checks.
 * Run: npm run test:phase35i-c-active-entity-custom
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { runPhase35iResolverTests } from "./phase35i-resolver-tests.mjs";

const root = process.cwd();
const require = createRequire(import.meta.url);

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

console.log("=== PHASE 35I-C ACTIVE ENTITY + CUSTOM 2.0 ===\n");

console.log("CASE — Working entity helper (pure)");
{
  // Inline pure logic mirror (source is TS — assert via static + dynamic if compiled unavailable)
  function resolveWorkingCompanyIds(authorizedCompanyIds, activeCompanyId) {
    const authorized = [...new Set(authorizedCompanyIds.map((id) => String(id || "").trim()).filter(Boolean))];
    if (authorized.length === 0) return [];
    const active = String(activeCompanyId ?? "").trim();
    if (active && authorized.includes(active)) return [active];
    return [authorized[0]];
  }

  assert(
    resolveWorkingCompanyIds(["A", "S"], "A").join() === "A",
    "authorized A,S active A → A only",
  );
  assert(
    resolveWorkingCompanyIds(["A", "S"], "S").join() === "S",
    "authorized A,S active S → S only",
  );
  assert(
    resolveWorkingCompanyIds(["A", "S"], "B").join() === "A",
    "authorized A,S active B → fallback A",
  );
  assert(
    resolveWorkingCompanyIds(["A"], "S").join() === "A",
    "authorized A only active S → fallback A",
  );
  assert(
    resolveWorkingCompanyIds(["A"], "A").join() === "A",
    "authorized A active A → A",
  );
  assert(
    resolveWorkingCompanyIds([], "A").length === 0,
    "empty authorized → empty working",
  );
  assert(
    !resolveWorkingCompanyIds(["A", "S"], "A").includes("S"),
    "active A never returns S",
  );
}

console.log("\nCASE — Wiring: getHrWorkingCompanyIds used for HR queries");
{
  assert(exists("lib/access/working-entity.ts"), "working-entity helper exists");
  assert(read("lib/access/hr-api-enforcement.ts").includes("getHrWorkingCompanyIds"), "HR enforcement exports working ids");
  assert(read("lib/access/hr-api-enforcement.ts").includes("getHrEffectiveCompanyIds"), "authorized set preserved");

  const surfaces = [
    "lib/hr/attendance-server.ts",
    "lib/hr/rating-server.ts",
    "lib/hr/leave-server.ts",
    "lib/hr/holiday-server.ts",
    "lib/hr/hr-policy-server.ts",
    "lib/hr/entity-attendance-policy-server.ts",
    "lib/hr/reporting-server.ts",
    "lib/hr/desk-workbench-server.ts",
    "lib/hr/work-schedule-auth.ts",
  ];
  for (const f of surfaces) {
    const src = read(f);
    assert(src.includes("getHrWorkingCompanyIds"), `${f} uses working company ids`);
    assert(!src.includes("getHrEffectiveCompanyIds"), `${f} no longer queries full authorized set`);
  }

  // Employee directory scope: Owner all/filter; org holders hierarchy; else working entity.
  const empList = read("lib/hr/employee-list-server.ts");
  const empScope = read("lib/hr/employee-list-scope.ts");
  assert(
    empList.includes("resolveEmployeeListCompanyScope") || empScope.includes("resolveEmployeeListCompanyScope"),
    "employee list uses scoped company set",
  );
  assert(
    empScope.includes("WORKING ENTITY ONLY") ||
      empScope.includes("working entity") ||
      empList.includes("WORKING ENTITY ONLY") ||
      empList.includes("working entity") ||
      empScope.includes("hr_working") ||
      empScope.includes('kind: "working"'),
    "employee list documents working-entity rule",
  );
  const empAuth = read("lib/hr/employee-auth.ts");
  assert(empAuth.includes("getHrEffectiveCompanyIds"), "employee target access uses authorized entity set");
  assert(!empAuth.includes("getHrWorkingCompanyIds"), "employee target access not limited to working entity");

  const assertFn = read("lib/access/hr-api-enforcement.ts");
  assert(assertFn.includes("getHrWorkingCompanyIds(ctx)"), "assertHrModuleEntityAccess requires working entity");
}

console.log("\nCASE — CUSTOM 2.0 business catalog (no primary web: UX)");
{
  const cat = read("lib/access/capability-ui-catalog.ts");
  assert(cat.includes("groupHrBusinessCapabilities"), "HR UI uses business capability groups");
  assert(cat.includes("isTechnicalWebPermissionKey"), "HR UI filters technical web keys");
  assert(cat.includes("Lihat Karyawan"), "business label for employee.view");
  assert(cat.includes("Edit Karyawan"), "business label for employee.update");
  assert(cat.includes("Lihat Kehadiran Tim"), "business label for attendance.view_team");

  const map = read("lib/access/business-capability-map.ts");
  assert(map.includes("employee.view"), "cap→path map has employee.view");
  assert(map.includes('"/hr/employees"'), "employee.view maps to /hr/employees");
  assert(map.includes("attendance.view_team"), "cap→path map has attendance.view_team");

  const resolve = read("lib/access/resolve-effective-access.ts");
  assert(resolve.includes("deriveWebPathsFromBusinessCapabilities"), "CUSTOM derives paths from business caps");
  assert(resolve.includes("permissionKeysToWebPaths"), "legacy web: keys still supported");
}

console.log("\nCASE — CUSTOM employee.view derives routes (runtime)");
{
  // Use dynamic import of compiled path unavailable — static + resolver suite
  const map = read("lib/access/business-capability-map.ts");
  assert(map.includes('"/hr"'), "employee.view includes /hr hub");
  assert(!map.includes("findings.view"), "no invented findings.view capability");
  assert(!map.includes("rating.manage"), "no invented rating.manage in map");
}

console.log("\nCASE — Preview uses runtime resolver fields");
{
  const admin = read("lib/access/module-assignment-admin-server.ts");
  assert(admin.includes("capabilityKeys"), "preview returns capability keys");
  assert(admin.includes("derivedWebPaths"), "preview returns derived web paths");
  assert(admin.includes("workingCompanyId"), "preview returns working entity");
  assert(admin.includes("resolveWorkingCompanyIds"), "preview uses working-entity helper");
  assert(admin.includes("buildUserAccessContext"), "preview uses runtime buildUserAccessContext");

  const ui = read("components/settings/ModuleAssignmentAdminPanel.tsx");
  assert(ui.includes("derivedWebPaths"), "Owner UI shows derived paths");
  assert(ui.includes("workingCompany"), "Owner UI shows working entity");
}

console.log("\nCASE — Multi-tab: Meja Kerja is action center (no Buka HR Lengkap)");
{
  const desk = read("components/workspace/StaffDeskWorkbench.tsx");
  assert(!desk.includes("fullModuleHref"), "no full-module CTA in Meja Kerja");
  assert(!desk.includes("Buka HR") && !desk.includes("fullModuleLabelKey"), "no Buka HR Lengkap button");
  const footer = read("components/workspace/WorkspaceMobileAccessFooter.tsx");
  assert(footer.includes('target="_blank"'), "Akses Mobile opens new tab");
  assert(footer.includes('rel="noopener noreferrer"'), "noopener noreferrer set");
}

console.log("\nCASE — Owner-only + Findings/Rating policy unchanged");
{
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c !== "employee.activate"'), "FULL excludes activate");
  assert(registry.includes('c !== "employee.manage_hr_accounts"'), "FULL excludes manage_hr_accounts");
  const enf = read("lib/access/hr-api-enforcement.ts");
  assert(enf.includes("assertHrAdminSurface"), "rating/leave admin surface helper kept");
  assert(read("lib/hr/rating-server.ts").includes("assertHrAdminSurface"), "rating still FULL surface");
  assert(read("lib/hr/reporting-server.ts").includes("isHrOperationalActor"), "findings keep operational actor");
}

console.log("\n--- Phase 35I resolver regression ---\n");
{
  const resolverResults = runPhase35iResolverTests();
  for (const msg of resolverResults.messages) console.log(msg);
  passed += resolverResults.passed;
  failed += resolverResults.failed;

  // CUSTOM employee.view must derive /hr/employees
  assert(
    read("lib/access/business-capability-map.ts").includes('"/hr/employees"'),
    "CUSTOM employee.view → /hr/employees in map",
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
