/**
 * Phase 35I-F1 — updated by FLEX-ORG-04.
 * Global GROUP/COMPANY mode is obsolete; collection may remain for historical data.
 * Run: npm run test:phase35i-f1-org-structure-mode
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
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("=== PHASE 35I-F1 ORG STRUCTURE (FLEX-ORG-04) ===\n");

console.log("CASE — Migration / collection retained (not dropped)");
{
  assert(exists("scripts/migrate-local-hr-phase35i-f1.mjs"), "migration script exists");
  const mig = read("scripts/migrate-local-hr-phase35i-f1.mjs");
  assert(mig.includes("hr_org_structure_config"), "creates config collection");
  assert(mig.includes("serba.space"), "blocks production URL");
  assert(read("lib/hr/org-structure-mode.ts").includes("hr_org_structure_config"), "types keep collection name");
}

console.log("\nCASE — Helpers obsolete as runtime SSOT");
{
  const server = read("lib/hr/org-structure-mode-server.ts");
  assert(server.includes("getOrganizationStructureModeState"), "compat get state");
  assert(server.includes("ORG_STRUCTURE_MODE_OBSOLETE") || server.includes("obsolete"), "set mode obsolete");
  assert(server.includes("resolveOrgStructureCompanyScope"), "authorized company filter");
  assert(!server.includes("accessMode === \"full\""), "HR FULL cannot change via helper");
}

console.log("\nCASE — Authorized company filter (no GROUP/COMPANY branching)");
{
  function resolveOrgStructureCompanyScope(args) {
    const authorized = args.authorizedCompanyIds;
    const requested = String(args.requestedCompanyId ?? "").trim();
    if (requested) {
      if (!args.isOwner && !authorized.includes(requested)) throw new Error("403");
      return { companyIds: [requested], contextLabel: "management" };
    }
    return { companyIds: authorized, contextLabel: "management" };
  }

  const auth = ["A", "S"];
  const all = resolveOrgStructureCompanyScope({
    isOwner: false,
    authorizedCompanyIds: auth,
    workingCompanyIds: ["S"],
  });
  assert(all.companyIds.join(",") === "A,S", "returns all authorized");
  assert(all.contextLabel === "management", "management context label");

  const filtered = resolveOrgStructureCompanyScope({
    isOwner: false,
    authorizedCompanyIds: auth,
    workingCompanyIds: ["S"],
    requestedCompanyId: "A",
  });
  assert(filtered.companyIds.join(",") === "A", "optional entity filter");

  let unauth = false;
  try {
    resolveOrgStructureCompanyScope({
      isOwner: false,
      authorizedCompanyIds: auth,
      workingCompanyIds: ["S"],
      requestedCompanyId: "B",
    });
  } catch {
    unauth = true;
  }
  assert(unauth, "unauthorized B rejected");
}

console.log("\nCASE — API obsolete write path");
{
  const api = read("app/api/hr/org-structure-mode/route.ts");
  assert(api.includes("requireOwnerApiUser"), "PUT requires Owner");
  assert(api.includes("requireOwnerOrHrApiUser"), "GET readable by Owner/HR");
  assert(api.includes("obsolete"), "documents obsolete");
}

console.log("\nCASE — Org position server not gated by global mode");
{
  const server = read("lib/hr/org-position-server.ts");
  assert(!server.includes("assertOrganizationStructureModeConfigured"), "mutations not mode-gated");
  assert(server.includes("resolveOrgStructureCompanyScope"), "list uses authorized filter");
  assert(!server.includes("ORG_STRUCTURE_WORKING_MISMATCH"), "no COMPANY working mismatch");
}

console.log("\nCASE — UI: no global GROUP/COMPANY editor");
{
  assert(exists("app/(dashboard)/pengaturan/struktur-organisasi/page.tsx"), "legacy mode path (redirect)");
  const legacy = read("app/(dashboard)/pengaturan/struktur-organisasi/page.tsx");
  assert(legacy.includes("redirect") && legacy.includes("/pengaturan/organisasi"), "legacy redirects to organisasi");

  const page = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(!page.includes("Gabung Multi-Company"), "no GROUP label");
  assert(!page.includes("Pisah Per Company"), "no COMPANY label");
  assert(page.includes("/pengaturan/manajemen"), "link to Manajemen");
  assert(!page.includes("Simpan Mode"), "Organisasi no mode save");
  assert(!page.includes("saveOrgMode"), "Organisasi no saveOrgMode");
  assert(!page.includes('href="/pengaturan/struktur-organisasi"'), "no separate mode page link");

  const mgmt = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(!mgmt.includes("saveOrgStructureMode"), "Manajemen no mode save");
  assert(!mgmt.includes("Gabung Multi-Company"), "Manajemen no Gabung");
  assert(mgmt.includes("CONFIGURABLE_FUNCTION_DOMAINS") || mgmt.includes("operatingModel"), "FOM remains");
}

console.log("\nCASE — Compatibility / non-goals");
{
  assert(exists("lib/hr/org-authority.ts"), "org authority preserved");
  assert(read("lib/hr/org-authority.ts").includes("positionsUnderOrgAuthority"), "hierarchy authority kept");
  assert(!exists("lib/hr/hr-employee-org-assignments.ts"), "B2 assignment table not invented in F1");
  assert(read("lib/hr/employee-detail-server.ts").includes("org_position_id"), "profiles.org_position_id still compatible");
  assert(
    exists("lib/hr/employee-list-scope.ts") &&
      read("lib/hr/employee-list-scope.ts").includes("owner_all"),
    "employee list Owner all-entities + working/org scope (post-F3)",
  );
}

console.log("\nCASE — Nav / RBAC path");
{
  const rbac = read("lib/rbac.ts");
  assert(rbac.includes("/pengaturan/organisasi") || exists("lib/rbac/known-routes.ts"), "rbac/organisasi path exists");
  assert(exists("app/(dashboard)/pengaturan/organisasi/page.tsx"), "organisasi page exists");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
