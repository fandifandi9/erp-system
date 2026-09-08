/**
 * Phase 35G — final dashboard + contextual Meja Kerja sidebar checks.
 * Run: npm run test:phase35g-final-dashboard
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

console.log("=== PHASE 35G FINAL DASHBOARD TESTS ===\n");

const staffView = read("components/workspace/StaffWorkspaceView.tsx");
const overview = read("components/workspace/StaffDashboardOverview.tsx");
const staffNav = read("components/workspace/StaffSidebarNav.tsx");
const staffConfig = read("lib/workspace/workspaces/staff.ts");
const resolver = read("lib/workspace/resolve-workspace.ts");
const designId = read("lib/i18n/messages/design-id.ts");

// Dashboard is overview, not module list
assert(staffView.includes("StaffDashboardOverview"), "dashboard uses overview component");
assert(!staffView.includes("WorkspaceNavItem"), "no navigation cards on dashboard");
assert(!staffView.includes("filterMainWorkspaceSectionsForUser"), "dashboard not section list");
assert(overview.includes("StaffAttendanceSummaryChart"), "donut attendance summary chart");
assert(overview.includes("StaffAttendanceTrendChart"), "attendance trend line chart");
assert(overview.includes("Shortcut Cepat") || designId.includes("Shortcut Cepat"), "quick shortcuts section");

// Dashboard title = Dasbor, not Meja Kerja
assert(staffConfig.includes('titleKey: "workspace.staff.dashboard.title"'), "dashboard title key");
assert(designId.includes('title: "Dasbor"'), "page title is Dasbor");
assert(!staffView.includes("workspace.desk.title"), "dashboard does not use Meja Kerja page title");

// Meja Kerja in sidebar only
assert(staffNav.includes("resolveDeskModulesForUser"), "Meja Kerja permission resolver");
assert(staffNav.includes("StaffDeskWorkbench"), "Meja Kerja workbench component");
assert(staffNav.includes("workspace.staff.section.desk"), "Meja Kerja sidebar section");
assert(read("components/workspace/StaffDeskWorkbench.tsx").includes("workspace.staff.desk.empty"), "empty state when no desk modules");
assert(staffNav.includes("filterCommonSectionsForUser"), "common sections separate from desk");

// Architecture
assert(!staffConfig.includes("personalSection"), "no profile in workspace config");
assert(staffConfig.includes("roleSections: []"), "staff empty roleSections");
assert(resolver.includes("filterDeskActionsForUser"), "desk actions resolver");
assert(!resolver.includes('role === "finance"'), "no hardcoded finance branch");

// Profile not in Meja Kerja / sidebar desk
assert(!staffNav.includes('"profile"'), "profile not in sidebar nav source");

// Company identity in header
assert(read("components/Navbar.tsx").includes("EntityBrandMark"), "entity brand in navbar");
assert(read("components/Navbar.tsx").includes("entity-identity"), "navbar fetches entity identity");
assert(!staffView.includes("entityBrand"), "entity removed from dashboard header");

// Right rail preserved
assert(staffView.includes("StaffWorkspaceRail"), "right rail preserved");
assert(staffView.includes("lg:col-span-8"), "main dashboard column");

// Real data sources — no dummy modules
assert(overview.includes("/api/hr/attendance/today"), "attendance today API");
assert(overview.includes("fetchSelfPayslipsApi"), "real payslip data");
assert(!overview.includes("dummy"), "no dummy data");

// Scope
assert(!read("app/(dashboard)/hr/page.tsx").includes("StaffDashboardOverview"), "HR not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
