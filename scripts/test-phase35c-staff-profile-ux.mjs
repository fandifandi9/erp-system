/**
 * Phase 35C — Staff workspace + profile UX refinement checks.
 * Run: npm run test:phase35c-staff-profile-ux
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

console.log("=== PHASE 35C STAFF + PROFILE UX TESTS ===\n");

const staff = read("components/workspace/StaffWorkspaceView.tsx");
const rail = read("components/workspace/StaffWorkspaceRail.tsx");
const profile = read("components/EmployeeSelfProfile.tsx");
const entityIdentity = read("app/api/profile/self/entity-identity/route.ts");
const entityLogo = read("app/api/profile/self/entity-logo/route.ts");

// Staff workspace layout
assert(staff.includes("lg:grid-cols-12"), "staff workspace 12-col grid");
assert(staff.includes("lg:col-span-8"), "staff main column");
assert(staff.includes("StaffWorkspaceRail"), "staff right rail");
assert(staff.includes("StaffDashboardOverview"), "staff dashboard overview");
assert(read("components/workspace/StaffDashboardOverview.tsx").includes("StatCard"), "dashboard KPI cards");
assert(!staff.includes("WorkspaceShortcut"), "heavy shortcut cards removed from staff main");

// Right rail — real data, no dummy
assert(rail.includes("/api/hr/attendance/today"), "rail uses attendance today API");
assert(rail.includes("getLeaveHistory"), "rail uses leave history");
assert(rail.includes("fetchOvertimeForUser"), "rail uses overtime data");
assert(!rail.includes("dummy"), "no dummy data in rail");
assert(rail.includes("canAccess"), "rail quick actions respect RBAC");

// Entity logo fix
assert(entityLogo.includes("getEntityIdentityForUser"), "staff-scoped entity logo route");
assert(entityIdentity.includes("/api/profile/self/entity-logo"), "entity-identity uses staff logo URL");
assert(read("components/ui/entity-brand-mark.tsx").includes("onError"), "EntityBrandMark handles image errors");
assert(read("components/ui/workspace-header.tsx").includes("EntityBrandMark"), "workspace header uses EntityBrandMark");

// Profile refinement
assert(profile.includes("max-w-6xl"), "profile wider layout");
assert(profile.includes("lg:grid-cols-12"), "profile two-column desktop");
assert(profile.includes("AccountPreferencesPanel"), "account preferences panel");
assert(!profile.includes("ProfileLanguageSettings"), "standalone language card removed");
assert(profile.includes("profile.sections.personalData"), "profile personal data section i18n");
assert(profile.includes("ActionBar"), "profile uses ActionBar for save");

// Global primitives
assert(read("components/ui/stat-card.tsx").includes("WorkspaceNavItem"), "WorkspaceNavItem global");
assert(read("components/LanguageSwitcher.tsx").includes('variant === "erp"'), "LanguageSwitcher ERP variant");

// Scope — no mass migration
assert(!read("app/(dashboard)/hr/page.tsx").includes("StaffWorkspaceRail"), "HR not migrated");
assert(!read("app/(dashboard)/hr/page.tsx").includes("WorkspaceNavItem"), "HR not migrated");

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
