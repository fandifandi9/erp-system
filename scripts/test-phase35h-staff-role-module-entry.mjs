/**
 * Phase 35H — Staff + additional role access + Meja Kerja + full module entry.
 * Run: npm run test:phase35h-staff-role-module-entry
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

console.log("=== PHASE 35H STAFF ROLE MODULE ENTRY TESTS ===\n");

const deskModules = read("lib/workspace/desk-modules.ts");
const resolver = read("lib/workspace/resolve-workspace.ts");
const workbench = read("components/workspace/StaffDeskWorkbench.tsx");
const staffNav = read("components/workspace/StaffSidebarNav.tsx");
const designId = read("lib/i18n/messages/design-id.ts");
const staffConfig = read("lib/workspace/workspaces/staff.ts");

// Architecture — permission-based desk modules
assert(deskModules.includes("DESK_MODULE_DEFINITIONS"), "desk module definitions");
assert(deskModules.includes('fullModuleAccessPath: "/hr"'), "HR full module path");
assert(deskModules.includes('fullModuleAccessPath: "/keuangan"'), "Finance full module path");
assert(deskModules.includes('fullModuleAccessPath: "/gudang"'), "Warehouse full module path");
assert(resolver.includes("resolveDeskModulesForUser"), "desk modules resolver");
assert(resolver.includes("canAccess(user, mod.fullModuleAccessPath)"), "full module gated by canAccess");
assert(resolver.includes("filterDeskItemsForUser"), "contextual items gated by path + capability");
assert(!resolver.includes('role === "hr"'), "no hardcoded hr role branch");
assert(!resolver.includes('role === "finance"'), "no hardcoded finance role branch");
assert(!resolver.includes('role === "warehouse"'), "no hardcoded warehouse role branch");
assert(!deskModules.includes('role ==='), "no role string checks in desk config");

// Contextual items — compact, not full module menus
assert(deskModules.includes("/hr/leave"), "HR leave review contextual item");
assert(deskModules.includes("/hr/attendance/suspicious"), "HR attendance review item");
assert(deskModules.includes("/hr/findings"), "HR findings item");
assert(deskModules.includes("/hr/employees"), "HR employees item");
assert(!deskModules.includes("/hr/rating"), "HR rating not in desk workbench");
assert(!deskModules.includes("/hr/work-calendar"), "HR calendar not in desk workbench");
assert(deskModules.includes("/keuangan/piutang"), "Finance invoice contextual item");
assert(deskModules.includes("/keuangan/rekonsiliasi"), "Finance reconciliation item");
assert(deskModules.includes("/gudang/opname"), "Warehouse opname item");
assert(deskModules.includes("/gudang/picking"), "Warehouse picking item");

// Meja Kerja = action center only (workspace menus already in sidebar by jabatan)
assert(!workbench.includes("fullModuleHref"), "no Buka … Lengkap CTA in Meja Kerja UI");
assert(!workbench.includes("ExternalLink"), "no full-module icon in Meja Kerja");
assert(designId.includes('hr: "Buka HR Lengkap"'), "legacy label key may remain in i18n");
assert(designId.includes('finance: "Buka Finance"'), "Finance label key retained in catalog");
assert(designId.includes('warehouse: "Buka Warehouse"'), "Warehouse label key retained in catalog");
assert(!workbench.includes("window.open"), "no window.open popup");

// Internal staff nav — same tab (Link, not target blank)
assert(staffNav.includes("<Link"), "staff sidebar uses Link for internal nav");
assert(staffNav.includes("StaffDeskWorkbench"), "sidebar uses desk workbench");
assert(staffNav.includes("resolveDeskModulesForUser"), "sidebar resolves desk modules");
assert(staffNav.includes("filterCommonSectionsForUser"), "common sections unchanged");
assert(staffNav.includes("workspace.staff.section.desk"), "Meja Kerja section preserved");
assert(staffNav.includes('href={STAFF_DASHBOARD}'), "Dasbor link preserved");
assert(read("components/Sidebar.tsx").includes("WorkspaceMobileAccessFooter"), "shared Akses Mobile footer");

// Empty state for staff without additional permission
assert(workbench.includes("workspace.staff.desk.empty"), "empty state when no modules");
assert(staffConfig.includes("roleSections: []"), "staff config empty roleSections");

// Multiple modules support
assert(
  (deskModules.match(/id: "hr"/g) || []).length >= 1 &&
    (deskModules.match(/id: "finance"/g) || []).length >= 1 &&
    (deskModules.match(/id: "warehouse"/g) || []).length >= 1,
  "HR, Finance, Warehouse module groups defined",
);

// Contextual quick actions — same tab Link
assert(workbench.includes("<Link"), "contextual items use Link (same tab)");
assert(!workbench.includes('target="_blank"'), "Meja Kerja items stay same-tab");

// Scope — Finance page not forced into desk shell
assert(read("app/(dashboard)/hr/page.tsx").includes("StaffDeskWorkbench"), "HR dashboard embeds Meja Kerja");
assert(!read("app/(dashboard)/keuangan/page.tsx").includes("StaffDeskWorkbench"), "Finance not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
