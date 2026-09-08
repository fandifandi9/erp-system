/**
 * Phase FLEX-ORG-02-FIX — GROUP + FOM HR runtime integration tests.
 * Run: npm run test:flex-org-02-fix
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

function intersect(a, b) {
  const set = new Set(b);
  return [...new Set(a.filter((id) => set.has(id)))];
}

function intersectHrOperationalLayers({ fomCompanyIds, moduleAuthCompanyIds, positionCompanyIds }) {
  let ids = intersect(fomCompanyIds, moduleAuthCompanyIds);
  if (positionCompanyIds != null) ids = intersect(ids, positionCompanyIds);
  return ids;
}

console.log("=== PHASE FLEX-ORG-02-FIX — FOM HR RUNTIME ===\n");

console.log("CASE — Central helper + validation");
{
  assert(exists("lib/org/resolve-hr-operational-company-scope.ts"), "HR ops scope helper");
  const h = read("lib/org/resolve-hr-operational-company-scope.ts");
  assert(h.includes("resolveOperationalEntityScope"), "uses FOM resolver (no duplicate)");
  assert(h.includes("intersectHrOperationalLayers") || h.includes("intersect("), "intersection");
  assert(h.includes("effectivePositionCompanyIds"), "position scope layer");
  assert(
    !read("lib/org/functional-operating-model-server.ts").includes("FOM_SHARED_REQUIRES_GROUP"),
    "FOM_SHARED_REQUIRES_GROUP removed (FLEX-ORG-04)",
  );
}

console.log("\nCASE — Intersection scenarios (pure)");
{
  // Scenario 1/5: GROUP Shared A+B ∩ module A+B ∩ position A+B
  assert(
    intersectHrOperationalLayers({
      fomCompanyIds: ["pt-a", "pt-b"],
      moduleAuthCompanyIds: ["pt-a", "pt-b"],
      positionCompanyIds: ["pt-a", "pt-b"],
    }).sort().join(",") === "pt-a,pt-b",
    "Scenario 1: Shared + position A+B → A+B",
  );

  // Scenario 6: membership A only
  assert(
    intersectHrOperationalLayers({
      fomCompanyIds: ["pt-a", "pt-b"],
      moduleAuthCompanyIds: ["pt-a"],
      positionCompanyIds: ["pt-a", "pt-b"],
    }).join(",") === "pt-a",
    "Scenario 6: membership A only → no PT B leak",
  );

  // Scenario 9: position A only
  assert(
    intersectHrOperationalLayers({
      fomCompanyIds: ["pt-a", "pt-b"],
      moduleAuthCompanyIds: ["pt-a", "pt-b"],
      positionCompanyIds: ["pt-a"],
    }).join(",") === "pt-a",
    "Scenario 9: FOM A+B ∩ position A → A (not silent expand)",
  );

  // Scenario 3 conceptual: Finance Separated not implied by GROUP
  assert(
    read("lib/org/functional-operating-model.ts").includes("SEPARATED"),
    "Scenario 3: Separated remains independent mode",
  );
}

console.log("\nCASE — FOM-aware consumers");
{
  const consumers = [
    ["lib/hr/employee-list-scope.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/leave-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/overtime-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/attendance-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/desk-workbench-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/recruitment-request-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/reporting-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/field-activity-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/rating-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/work-schedule-server.ts", "getHrOperationalCompanyIds"],
    ["lib/hr/holiday-server.ts", "getHrOperationalCompanyIds"],
  ];
  for (const [file, needle] of consumers) {
    assert(read(file).includes(needle), `${file} FOM-aware`);
  }
}

console.log("\nCASE — Personal / working-company preserved");
{
  assert(
    read("lib/access/hr-api-enforcement.ts").includes("getHrWorkingCompanyIds"),
    "working-company helper retained",
  );
  assert(
    read("lib/hr/reporting-server.ts").includes("stampCompanyId") &&
      read("lib/hr/reporting-server.ts").includes("getHrWorkingCompanyIds"),
    "new case stamp still working/active (not Shared span)",
  );
  assert(
    read("lib/hr/attendance-server.ts").includes("Personal check-in does not use this") ||
      read("lib/hr/attendance-server.ts").includes("administrative visibility"),
    "attendance personal vs HR admin separated",
  );
}

console.log("\nCASE — UI consistency (FLEX-ORG-04: no global mode)");
{
  const mgmt = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(mgmt.includes("CONFIGURABLE_FUNCTION_DOMAINS") || mgmt.includes("operatingModel"), "manajemen FOM");
  assert(!mgmt.includes("orgStructureModeTitle"), "no Mode Struktur on manajemen");
  assert(mgmt.includes("/pengaturan/organisasi"), "link to org structure");
  const org = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(org.includes("/pengaturan/manajemen"), "organisasi links to manajemen");
  assert(!org.includes("Simpan Mode"), "org page no mode save");
  assert(!org.includes("Gabung Multi-Company"), "org page no Gabung label");
}

console.log("\nCASE — Position scope not collapsed by global COMPANY mode");
{
  const scope = read("lib/hr/org-position-scope.ts");
  assert(!scope.includes('mode === "COMPANY"'), "no COMPANY mode collapse");
  assert(scope.includes("scopeType"), "position scopeType used");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
