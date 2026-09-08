/**
 * Phase FLEX-ORG-03 → updated by FLEX-ORG-04.
 * Org mode is obsolete; Manajemen must NOT expose global GROUP/COMPANY editor.
 * Run: npm run test:flex-org-03
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
    console.log("  ✓", msg);
  } else {
    failed++;
    console.log("  ✗", msg);
  }
}

console.log("=== PHASE FLEX-ORG-03 (updated FLEX-ORG-04) — NO GLOBAL MODE UI ===\n");

console.log("CASE — Collection retained but obsolete as SSOT");
{
  assert(
    read("lib/hr/org-structure-mode.ts").includes("hr_org_structure_config"),
    "collection name retained (not dropped)",
  );
  assert(
    read("lib/hr/org-structure-mode-server.ts").includes("ORG_STRUCTURE_MODE_OBSOLETE") ||
      read("lib/hr/org-structure-mode-server.ts").includes("obsolete"),
    "setter obsolete",
  );
  assert(
    !read("lib/org/functional-operating-model-server.ts").includes("FOM_SHARED_REQUIRES_GROUP"),
    "FOM_SHARED_REQUIRES_GROUP removed",
  );
}

console.log("\nCASE — Manajemen has no global mode editor");
{
  const mgmt = read("app/(dashboard)/pengaturan/manajemen/page.tsx");
  assert(!mgmt.includes("saveOrgStructureMode"), "no saveOrgStructureMode");
  assert(!mgmt.includes("orgStructureModeTitle"), "no Mode Struktur section");
  assert(!mgmt.includes("Gabung Multi-Company"), "no Gabung UI");
  assert(mgmt.includes("membershipCompanies"), "legal entities display");
  assert(mgmt.includes("/pengaturan/perusahaan"), "link to Perusahaan");
  assert(mgmt.includes("functional-operating-models") || mgmt.includes("CONFIGURABLE_FUNCTION_DOMAINS"), "FOM UI present");
}

console.log("\nCASE — Organisasi is hierarchy-only");
{
  const org = read("app/(dashboard)/pengaturan/organisasi/page.tsx");
  assert(!org.includes("saveOrgMode"), "no saveOrgMode");
  assert(!org.includes("Simpan Mode"), "no Simpan Mode");
  assert(!org.includes("Gabung Multi-Company"), "no Gabung label");
  assert(org.includes("/pengaturan/manajemen"), "link to Manajemen for FOM");
}

console.log("\nCASE — Management / FOM collections intact");
{
  assert(read("lib/org/collections.ts").includes("sys_management_groups"), "management groups");
  assert(read("lib/org/collections.ts").includes("sys_management_group_entities"), "membership");
  assert(
    read("lib/org/management-group-server.ts").includes("setManagementGroupEntities"),
    "setEntities API preserved",
  );
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
