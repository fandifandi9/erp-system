/**
 * Phase 35E — role-aware workspace shell + sidebar branding checks.
 * Run: npm run test:phase35e-role-aware-workspace
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

console.log("=== PHASE 35E ROLE-AWARE WORKSPACE SHELL TESTS ===\n");

const types = read("lib/workspace/types.ts");
const resolver = read("lib/workspace/resolve-workspace.ts");
const staffConfig = read("lib/workspace/workspaces/staff.ts");
const sidebarBrand = read("components/ui/sidebar-brand.tsx");
const sidebar = read("components/Sidebar.tsx");
const staffView = read("components/workspace/StaffWorkspaceView.tsx");

// Role-aware architecture
assert(types.includes("commonSections"), "WorkspaceConfig commonSections");
assert(types.includes("roleSections"), "WorkspaceConfig roleSections");
assert(types.includes("mergeWorkspaceSections"), "merge helper");
assert(resolver.includes("getWorkspaceConfigForUser"), "getWorkspaceConfigForUser");
assert(resolver.includes("excludeSectionIds"), "sidebar exclude option");
assert(types.includes("personalSection"), "WorkspaceConfig personalSection optional");
assert(resolver.includes("filterDeskActionsForUser"), "Meja Kerja desk actions");
assert(resolver.includes("filterCommonSectionsForUser"), "common sections filter");
assert(staffConfig.includes('titleKey: "workspace.staff.dashboard.title"'), "dashboard title key");

// Sidebar branding fix
assert(sidebarBrand.includes("SYSTEM_LOGO_PATH"), "square logo not wide logo");
assert(sidebarBrand.includes("bg-white"), "logo white tile on dark sidebar");
assert(staffConfig.includes("roleSections: []"), "staff has empty roleSections");
assert(!staffConfig.includes("personalSection"), "no personal section in staff config");
assert(!sidebarBrand.includes("SYSTEM_LOGO_WIDE_PATH"), "does not use wide logo in sidebar");
assert(sidebar.includes("SidebarBrand"), "sidebar uses SidebarBrand");
assert(sidebar.includes("lg:w-72"), "staff sidebar wider for brand");

// Meja Kerja content
assert(staffView.includes("StaffDashboardOverview"), "dashboard overview view");
assert(staffView.includes("StaffWorkspaceRail"), "right rail preserved");
assert(read("components/Navbar.tsx").includes("EntityBrandMark"), "entity identity in navbar");

// Entity logo API preserved
assert(read("app/api/profile/self/entity-identity/route.ts").includes("/api/profile/self/entity-logo"), "staff-safe logo URL");

// Scope
assert(!read("app/(dashboard)/hr/page.tsx").includes("getWorkspaceConfigForUser"), "HR not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
