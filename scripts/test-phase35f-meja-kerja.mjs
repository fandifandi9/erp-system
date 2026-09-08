/**
 * Phase 35F — Meja Kerja concept checks (sidebar section naming).
 * Run: npm run test:phase35f-meja-kerja
 */

import fs from "fs";

const root = process.cwd();
let passed = 0;
let failed = 0;

function read(rel) {
  return fs.readFileSync(`${root}/${rel}`, "utf8");
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

console.log("=== PHASE 35F MEJA KERJA CONCEPT TESTS ===\n");

const designId = read("lib/i18n/messages/design-id.ts");
const staffConfig = read("lib/workspace/workspaces/staff.ts");
const resolver = read("lib/workspace/resolve-workspace.ts");
const staffNav = read("components/workspace/StaffSidebarNav.tsx");
const sidebarBrand = read("components/ui/sidebar-brand.tsx");

assert(designId.includes('desk: "Meja Kerja"'), "Meja Kerja section label in ID");
assert(!designId.includes("Meja Kerja Staf"), "no Meja Kerja Staf in ID messages");
assert(staffConfig.includes("roleSections: []"), "staff empty roleSections");
assert(resolver.includes("filterDeskActionsForUser"), "desk actions resolver");
assert(!resolver.includes('role === "finance"'), "no hardcoded finance role branch");
assert(staffNav.includes("workspace.staff.section.desk"), "Meja Kerja in sidebar");
assert(sidebarBrand.includes("SYSTEM_LOGO_PATH"), "square system logo");
assert(sidebarBrand.includes("bg-white"), "logo white tile on dark sidebar");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
