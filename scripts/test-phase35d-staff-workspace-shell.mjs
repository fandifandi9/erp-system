/**
 * Phase 35D — staff workspace shell / sidebar refinement checks.
 * Run: npm run test:phase35d-staff-workspace-shell
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

console.log("=== PHASE 35D STAFF WORKSPACE SHELL TESTS ===\n");

const sidebar = read("components/Sidebar.tsx");
const staffNav = read("components/workspace/StaffSidebarNav.tsx");
const navbar = read("components/Navbar.tsx");
const staffConfig = read("lib/workspace/workspaces/staff.ts");
const staffView = read("components/workspace/StaffWorkspaceView.tsx");

// Staff sidebar shell
assert(sidebar.includes("StaffSidebarNav"), "Sidebar renders staff nav");
assert(sidebar.includes('dashboardRoute === "/dashboard-staff"'), "staff shell detection");
assert(sidebar.includes("SidebarBrand"), "brand in sidebar header");
assert(staffNav.includes("filterCommonSectionsForUser"), "common sections filter");
assert(staffNav.includes("resolveDeskModulesForUser"), "Meja Kerja desk filter");
assert(staffConfig.includes("commonSections"), "structured common sections");
assert(!staffConfig.includes("personalSection"), "profile not in workspace config");
assert(staffConfig.includes("/dashboard-staff/attendance"), "attendance route");
assert(staffConfig.includes("/dashboard-staff/leave"), "leave route");
assert(staffConfig.includes("/dashboard-staff/payroll"), "payroll route");
assert(staffConfig.includes("/dashboard-staff/policies"), "policies route");
assert(staffConfig.includes("/hr/reports"), "reports route");
assert(!staffConfig.includes("STAFF_SIDEBAR_EXCLUDE_SECTIONS"), "profile excluded via architecture not sidebar hack");
assert(staffNav.includes("workspace.staff.section.desk"), "Meja Kerja sidebar section");

// Topbar — no dominant brand for staff
assert(navbar.includes("isStaffShell"), "navbar staff shell detection");
assert(navbar.includes("!isStaffShell"), "brand hidden for staff shell");

// Phase 35C content preserved
assert(staffView.includes("StaffWorkspaceRail"), "right rail preserved");
assert(staffView.includes("lg:col-span-8"), "main column preserved");
assert(staffView.includes("max-w-7xl") || read("components/layout/workspace-layout.tsx").includes("max-w-7xl"), "max width preserved");

// Scope
assert(!read("app/(dashboard)/hr/page.tsx").includes("StaffSidebarNav"), "HR not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
