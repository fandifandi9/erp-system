/**
 * Phase 35I-B0 — Owner Module Assignment UI tests.
 * Run: npm run test:phase35i-b0-owner-module-assignment-ui
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

console.log("=== PHASE 35I-B0 OWNER MODULE ASSIGNMENT UI TESTS ===\n");

console.log("CASE — Owner gate (canManageModuleAssignments)");
{
  const gate = read("lib/access/can-manage-module-assignments.ts");
  assert(gate.includes("isOwnerAccount"), "gate uses isOwnerAccount");
  assert(!gate.includes("isHrAccount"), "HR cannot manage module assignments");
}

console.log("\nCASE — Admin server CRUD + validation");
{
  const admin = read("lib/access/module-assignment-admin-server.ts");
  assert(admin.includes("validateModuleAssignmentInput"), "server validation exists");
  assert(admin.includes("isOwnerOnlyModuleCapability"), "owner-only caps rejected");
  assert(admin.includes("assertNoDuplicateActiveAssignment"), "duplicate active prevented");
  assert(admin.includes("membershipCompanyIds.includes"), "SELECTED intersects membership");
  assert(admin.includes("buildUserAccessContext"), "preview uses effective access resolver");
}

console.log("\nCASE — Owner-only capabilities excluded from FULL assign");
{
  const ownerOnly = read("lib/access/owner-only-capabilities.ts");
  assert(ownerOnly.includes("employee.activate"), "activate is owner-only");
  assert(ownerOnly.includes("employee.manage_hr_accounts"), "manage_hr_accounts owner-only");
  const registry = read("lib/access/module-registry.ts");
  assert(registry.includes('c !== "employee.activate"'), "FULL HR excludes activate");
}

console.log("\nCASE — API routes Owner-protected");
{
  const listRoute = read("app/api/access/admin/module-assignments/route.ts");
  assert(listRoute.includes("canManageModuleAssignments"), "list route owner gate");
  assert(listRoute.includes("export async function GET"), "GET list");
  assert(listRoute.includes("export async function POST"), "POST create");
  const idRoute = read("app/api/access/admin/module-assignments/[id]/route.ts");
  assert(idRoute.includes("canManageModuleAssignments"), "id route owner gate");
  assert(idRoute.includes("export async function PATCH"), "PATCH update");
  assert(idRoute.includes("export async function DELETE"), "DELETE remove");
  const preview = read("app/api/access/admin/module-assignments/preview/route.ts");
  assert(preview.includes("previewAssignmentCapabilities"), "preview endpoint");
}

console.log("\nCASE — UI page + component");
{
  assert(exists("app/(dashboard)/pengaturan/akses-modul/page.tsx"), "akses-modul page exists");
  assert(exists("components/settings/ModuleAssignmentAdminPanel.tsx"), "admin panel component");
  const panel = read("components/settings/ModuleAssignmentAdminPanel.tsx");
  assert(panel.includes("isOwnerAccount"), "UI checks owner account");
  assert(panel.includes("Hanya Owner"), "denied message for non-owner");
  assert(panel.includes("Akses Modul"), "page title");
  assert(panel.includes("Tambah Akses Modul"), "create action");
  assert(!panel.includes("permission_key"), "no raw permission keys in primary UI");
}

console.log("\nCASE — Pengaturan hub link (Owner extras)");
{
  const hub = read("app/(dashboard)/pengaturan/page.tsx");
  assert(hub.includes("/pengaturan/akses-modul"), "hub links to akses-modul");
  assert(hub.includes("showOwnerPengaturanExtras"), "link only in owner extras block");
  const nav = read("lib/wms/navigation.ts");
  assert(nav.includes('href: "/pengaturan/akses-modul"'), "sidebar nav has Akses Modul");
  const sidebar = read("components/Sidebar.tsx");
  assert(sidebar.includes("isHrOperationalPath"), "staff HR module switches sidebar on HR routes");
}

console.log("\nCASE — Capability UI catalog (human labels)");
{
  const cat = read("lib/access/capability-ui-catalog.ts");
  assert(cat.includes("buildModuleUiCatalog"), "catalog builder");
  assert(cat.includes("isOwnerOnlyModuleCapability"), "catalog excludes owner-only");
  assert(cat.includes("Karyawan"), "HR group label");
}

console.log("\nCASE — desk_enabled boundary (not auth)");
{
  const panel = read("components/settings/ModuleAssignmentAdminPanel.tsx");
  assert(panel.includes("deskEnabled"), "desk toggle in form");
  assert(panel.includes("tidak memberikan permission"), "desk disclaimer");
  const admin = read("lib/access/module-assignment-admin-server.ts");
  assert(admin.includes("desk_enabled"), "desk persisted separately");
}

console.log("\nCASE — Entity scope ALL respects membership (INTERSECTION)");
{
  const admin = read("lib/access/module-assignment-admin-server.ts");
  assert(admin.includes("listAccessibleCompanyIds"), "membership loaded for preview");
  const entity = read("lib/access/entity-scope.ts");
  assert(entity.includes("authorizedEntityIds.includes"), "intersection in entity scope");
}

console.log("\nCASE — Staff/HR cannot write via API (static)");
{
  const listRoute = read("app/api/access/admin/module-assignments/route.ts");
  assert(listRoute.includes("403"), "forbidden response for non-owner");
  assert(listRoute.includes("Hanya Owner"), "owner-only error message");
}

console.log("\nCASE — package.json test script");
{
  const pkg = read("package.json");
  assert(pkg.includes("test:phase35i-b0-owner-module-assignment-ui"), "npm script registered");
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
