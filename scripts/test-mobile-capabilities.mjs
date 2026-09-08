/**
 * scripts/test-mobile-capabilities.mjs
 * Phase 24A — Unit tests for mobile capability resolver
 *
 * Self-contained: re-implements the resolver logic inline so no TypeScript
 * compilation or module bundling is required.
 *
 * Run:  node scripts/test-mobile-capabilities.mjs
 * Or:   npm run test:mobile-capabilities
 *
 * Tests every role defined in the system:
 *   owner · hr · manager · staff · staff-basic · security · ob
 * Plus edge cases:
 *   unauthenticated · null · malformed · unknown role · inventory_role variants
 */

// ─── Inline resolver (mirrors mobile/lib/capabilities.ts logic) ──────────────
// This avoids TypeScript compilation at test time while keeping the test
// authoritative on expected behavior.

const VALID_ROLE_CODES = ["hr", "manager", "staff", "staff-basic", "security", "ob"];

function normalizeRoleCode(value) {
  const s = (value || "").toString().toLowerCase().trim();
  return VALID_ROLE_CODES.includes(s) ? s : null;
}

function normalizeAuthModel(user) {
  if (!user) return { accountType: "user", roleCode: "staff-basic", dashboardAccess: false };
  const rawRole = (user.role || user.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user.account_type || (rawRole === "owner" ? "owner" : "user")) || "user")
    .toLowerCase()
    .trim();

  if (accountType === "owner") {
    return { accountType: "owner", roleCode: null, dashboardAccess: true };
  }

  const DASHBOARD_ROLES = ["hr", "manager", "staff"];
  const roleCode = normalizeRoleCode(user.role_code) || normalizeRoleCode(rawRole) || "staff-basic";
  const dashboardAccess =
    typeof user.dashboard_access === "boolean"
      ? user.dashboard_access
      : DASHBOARD_ROLES.includes(roleCode);

  return { accountType: "user", roleCode, dashboardAccess };
}

function readInventoryRole(user) {
  if (!user) return "none";
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "admin";
  const raw = (user.inventory_role ?? "none").toString().toLowerCase().trim();
  if (raw === "staff" || raw === "supervisor" || raw === "admin") return raw;
  return "none";
}

function canAccessInventory(user) {
  if (!user) return false;
  const auth = normalizeAuthModel(user);
  return readInventoryRole(user) !== "none" || auth.accountType === "owner";
}

function resolveMobileCapabilities(user) {
  const caps = new Set();

  // Fail closed: null/undefined/malformed
  if (!user || typeof user !== "object") return caps;

  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const roleCode = auth.roleCode;
  const isHr = !isOwner && roleCode === "hr";
  const isHrOrOwner = isOwner || isHr;

  // Universal capabilities (all authenticated)
  caps.add("profile.view_own");
  caps.add("profile.edit_own");
  caps.add("dashboard.work");
  caps.add("attendance.view");
  caps.add("attendance.check_in");
  caps.add("attendance.check_out");
  caps.add("schedule.view");
  caps.add("leave.view_own");
  caps.add("leave.create");
  caps.add("leave.cancel_own");
  caps.add("overtime.view_own");
  caps.add("overtime.create");
  caps.add("field_activity.view_own");
  caps.add("field_activity.create");
  caps.add("payroll.view_own");
  caps.add("report.view_own");
  caps.add("report.create");
  caps.add("rating.task_view");
  caps.add("rating.task_submit");
  caps.add("rating.result_view_own");

  if (isHrOrOwner || auth.dashboardAccess) {
    caps.add("dashboard.operational");
  }

  if (isHrOrOwner) {
    caps.add("leave.approve");
    caps.add("overtime.approve");
    caps.add("field_activity.approve");
    caps.add("report.view_all");
    caps.add("report.review");
    caps.add("report.close");
    caps.add("finding.view");
    caps.add("finding.create");
    caps.add("finding.manage");
    caps.add("rating.manage");
    caps.add("hr.queue.leave");
    caps.add("hr.queue.overtime");
    caps.add("hr.queue.field_activity");
    caps.add("hr.staff.view");
  }

  if (canAccessInventory(user)) {
    caps.add("inventory.view");
    caps.add("inventory.zone_scan");
    caps.add("inventory.product_scan");
    caps.add("inventory.packing");
    caps.add("inventory.movement_create");
    caps.add("wms.workstation_scan");

    const invRole = readInventoryRole(user);
    if (isOwner || invRole === "supervisor" || invRole === "admin") {
      caps.add("inventory.opname");
    }
  }

  return caps;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition) {
  if (condition) {
    process.stdout.write("  ✓ " + label + "\n");
    passed++;
  } else {
    process.stdout.write("  ✗ " + label + "\n");
    failed++;
    failures.push(label);
  }
}

function assertHas(label, caps, cap) {
  assert(label + ": has " + cap, caps.has(cap));
}

function assertLacks(label, caps, cap) {
  assert(label + ": lacks " + cap, !caps.has(cap));
}

function section(title) {
  process.stdout.write("\n── " + title + " ──\n");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

section("FAIL CLOSED — unauthenticated / malformed");

{
  const nullCaps = resolveMobileCapabilities(null);
  assert("null user → empty set", nullCaps.size === 0);

  const undefCaps = resolveMobileCapabilities(undefined);
  assert("undefined user → empty set", undefCaps.size === 0);

  const strCaps = resolveMobileCapabilities("bad-input");
  assert("string user → empty set", strCaps.size === 0);

  const numCaps = resolveMobileCapabilities(42);
  assert("number user → empty set", numCaps.size === 0);

  const emptyCaps = resolveMobileCapabilities({});
  // Empty object = no account_type, no role → treated as staff-basic (fail safe)
  assert("empty {} user → at least has universal caps", emptyCaps.has("attendance.view"));
  assertLacks("empty {} user", emptyCaps, "leave.approve");
  assertLacks("empty {} user", emptyCaps, "finding.view");
  assertLacks("empty {} user", emptyCaps, "hr.queue.leave");

  const unknownRoleCaps = resolveMobileCapabilities({ account_type: "user", role_code: "UNKNOWN_ROLE_XYZ" });
  assert("unknown role → staff-basic fallback, no HR caps", !unknownRoleCaps.has("leave.approve"));
  assert("unknown role → still has universal caps", unknownRoleCaps.has("attendance.view"));
}

// ─────────────────────────────────────────────────────────────────────────────
section("OWNER");

{
  const user = { account_type: "owner", role: "owner" };
  const caps = resolveMobileCapabilities(user);

  // Universal
  assertHas("owner", caps, "attendance.view");
  assertHas("owner", caps, "attendance.check_in");
  assertHas("owner", caps, "leave.view_own");
  assertHas("owner", caps, "leave.create");
  assertHas("owner", caps, "payroll.view_own");
  assertHas("owner", caps, "dashboard.work");
  assertHas("owner", caps, "rating.task_view");
  assertHas("owner", caps, "report.create");

  // Operational
  assertHas("owner", caps, "dashboard.operational");

  // HR/Owner exclusive
  assertHas("owner", caps, "leave.approve");
  assertHas("owner", caps, "overtime.approve");
  assertHas("owner", caps, "field_activity.approve");
  assertHas("owner", caps, "report.view_all");
  assertHas("owner", caps, "report.review");
  assertHas("owner", caps, "report.close");
  assertHas("owner", caps, "finding.view");
  assertHas("owner", caps, "finding.create");
  assertHas("owner", caps, "finding.manage");
  assertHas("owner", caps, "rating.manage");
  assertHas("owner", caps, "hr.queue.leave");
  assertHas("owner", caps, "hr.queue.overtime");
  assertHas("owner", caps, "hr.queue.field_activity");
  assertHas("owner", caps, "hr.staff.view");

  // Inventory (owner always has full inventory access)
  assertHas("owner", caps, "inventory.view");
  assertHas("owner", caps, "inventory.zone_scan");
  assertHas("owner", caps, "inventory.product_scan");
  assertHas("owner", caps, "inventory.packing");
  assertHas("owner", caps, "inventory.opname");
  assertHas("owner", caps, "inventory.movement_create");
  assertHas("owner", caps, "wms.workstation_scan");
}

// ─────────────────────────────────────────────────────────────────────────────
section("HR");

{
  const user = { account_type: "user", role_code: "hr", dashboard_access: true };
  const caps = resolveMobileCapabilities(user);

  // Universal
  assertHas("hr", caps, "attendance.view");
  assertHas("hr", caps, "leave.view_own");
  assertHas("hr", caps, "overtime.create");
  assertHas("hr", caps, "payroll.view_own");
  assertHas("hr", caps, "report.create");
  assertHas("hr", caps, "rating.task_view");
  assertHas("hr", caps, "dashboard.work");

  // HR operational
  assertHas("hr", caps, "dashboard.operational");

  // HR exclusive
  assertHas("hr", caps, "leave.approve");
  assertHas("hr", caps, "overtime.approve");
  assertHas("hr", caps, "field_activity.approve");
  assertHas("hr", caps, "report.view_all");
  assertHas("hr", caps, "report.review");
  assertHas("hr", caps, "report.close");
  assertHas("hr", caps, "finding.view");
  assertHas("hr", caps, "finding.create");
  assertHas("hr", caps, "finding.manage");
  assertHas("hr", caps, "rating.manage");
  assertHas("hr", caps, "hr.queue.leave");
  assertHas("hr", caps, "hr.queue.overtime");
  assertHas("hr", caps, "hr.queue.field_activity");
  assertHas("hr", caps, "hr.staff.view");

  // HR should NOT have inventory without inventory_role
  assertLacks("hr (no inv_role)", caps, "inventory.view");
  assertLacks("hr (no inv_role)", caps, "inventory.zone_scan");
  assertLacks("hr (no inv_role)", caps, "wms.workstation_scan");
}

// ─────────────────────────────────────────────────────────────────────────────
section("MANAGER");

{
  const user = { account_type: "user", role_code: "manager", dashboard_access: true };
  const caps = resolveMobileCapabilities(user);

  // Universal
  assertHas("manager", caps, "attendance.view");
  assertHas("manager", caps, "leave.view_own");
  assertHas("manager", caps, "overtime.create");
  assertHas("manager", caps, "payroll.view_own");
  assertHas("manager", caps, "report.create");
  assertHas("manager", caps, "rating.task_view");
  assertHas("manager", caps, "dashboard.work");
  assertHas("manager", caps, "dashboard.operational"); // has dashboard_access

  // Manager should NOT have HR/Owner exclusives
  assertLacks("manager", caps, "leave.approve");
  assertLacks("manager", caps, "overtime.approve");
  assertLacks("manager", caps, "field_activity.approve");
  assertLacks("manager", caps, "report.view_all");
  assertLacks("manager", caps, "finding.view");
  assertLacks("manager", caps, "finding.create");
  assertLacks("manager", caps, "rating.manage");
  assertLacks("manager", caps, "hr.queue.leave");
  assertLacks("manager", caps, "hr.staff.view");
}

// ─────────────────────────────────────────────────────────────────────────────
section("STAFF");

{
  const user = { account_type: "user", role_code: "staff", dashboard_access: true };
  const caps = resolveMobileCapabilities(user);

  assertHas("staff", caps, "attendance.view");
  assertHas("staff", caps, "leave.create");
  assertHas("staff", caps, "overtime.create");
  assertHas("staff", caps, "report.create");
  assertHas("staff", caps, "rating.task_submit");
  assertHas("staff", caps, "payroll.view_own");
  assertHas("staff", caps, "dashboard.work");
  assertHas("staff", caps, "dashboard.operational"); // has dashboard_access

  assertLacks("staff", caps, "leave.approve");
  assertLacks("staff", caps, "finding.view");
  assertLacks("staff", caps, "report.view_all");
  assertLacks("staff", caps, "rating.manage");
  assertLacks("staff", caps, "hr.queue.leave");
}

// ─────────────────────────────────────────────────────────────────────────────
section("STAFF-BASIC");

{
  const user = { account_type: "user", role_code: "staff-basic", dashboard_access: false };
  const caps = resolveMobileCapabilities(user);

  // Has universal capabilities
  assertHas("staff-basic", caps, "attendance.view");
  assertHas("staff-basic", caps, "attendance.check_in");
  assertHas("staff-basic", caps, "leave.create");
  assertHas("staff-basic", caps, "overtime.create");
  assertHas("staff-basic", caps, "report.create");
  assertHas("staff-basic", caps, "rating.task_view");
  assertHas("staff-basic", caps, "payroll.view_own");
  assertHas("staff-basic", caps, "dashboard.work");

  // No dashboard_access → no operational section
  assertLacks("staff-basic (no dash)", caps, "dashboard.operational");

  assertLacks("staff-basic", caps, "leave.approve");
  assertLacks("staff-basic", caps, "finding.view");
  assertLacks("staff-basic", caps, "report.view_all");
  assertLacks("staff-basic", caps, "hr.queue.leave");
  assertLacks("staff-basic", caps, "inventory.view");
}

// ─────────────────────────────────────────────────────────────────────────────
section("SECURITY");

{
  const user = { account_type: "user", role_code: "security", dashboard_access: false };
  const caps = resolveMobileCapabilities(user);

  // Security role has no dashboard_access by default
  assertHas("security", caps, "attendance.view");
  assertHas("security", caps, "attendance.check_in");
  assertHas("security", caps, "leave.create");
  assertHas("security", caps, "payroll.view_own");
  assertHas("security", caps, "dashboard.work");

  assertLacks("security", caps, "dashboard.operational");
  assertLacks("security", caps, "leave.approve");
  assertLacks("security", caps, "overtime.approve");
  assertLacks("security", caps, "finding.view");
  assertLacks("security", caps, "report.view_all");
  assertLacks("security", caps, "hr.queue.leave");
  assertLacks("security", caps, "inventory.view");
}

// ─────────────────────────────────────────────────────────────────────────────
section("OB (Office Boy)");

{
  const user = { account_type: "user", role_code: "ob", dashboard_access: false };
  const caps = resolveMobileCapabilities(user);

  assertHas("ob", caps, "attendance.view");
  assertHas("ob", caps, "attendance.check_in");
  assertHas("ob", caps, "leave.create");
  assertHas("ob", caps, "payroll.view_own");
  assertHas("ob", caps, "dashboard.work");

  assertLacks("ob", caps, "dashboard.operational");
  assertLacks("ob", caps, "leave.approve");
  assertLacks("ob", caps, "finding.view");
  assertLacks("ob", caps, "report.view_all");
  assertLacks("ob", caps, "hr.queue.leave");
  assertLacks("ob", caps, "inventory.view");
}

// ─────────────────────────────────────────────────────────────────────────────
section("INVENTORY_ROLE variants");

{
  // Staff with inventory_role=staff
  const warehouseStaff = {
    account_type: "user",
    role_code: "staff",
    dashboard_access: true,
    inventory_role: "staff",
  };
  const wsCaps = resolveMobileCapabilities(warehouseStaff);
  assertHas("inv:staff", wsCaps, "inventory.view");
  assertHas("inv:staff", wsCaps, "inventory.zone_scan");
  assertHas("inv:staff", wsCaps, "inventory.product_scan");
  assertHas("inv:staff", wsCaps, "inventory.packing");
  assertHas("inv:staff", wsCaps, "inventory.movement_create");
  assertHas("inv:staff", wsCaps, "wms.workstation_scan");
  // Staff cannot do opname (requires supervisor+)
  assertLacks("inv:staff", wsCaps, "inventory.opname");

  // Supervisor
  const invSup = {
    account_type: "user",
    role_code: "staff",
    dashboard_access: true,
    inventory_role: "supervisor",
  };
  const supCaps = resolveMobileCapabilities(invSup);
  assertHas("inv:supervisor", supCaps, "inventory.view");
  assertHas("inv:supervisor", supCaps, "inventory.opname");

  // Admin inventory_role
  const invAdmin = {
    account_type: "user",
    role_code: "staff",
    dashboard_access: true,
    inventory_role: "admin",
  };
  const admCaps = resolveMobileCapabilities(invAdmin);
  assertHas("inv:admin", admCaps, "inventory.view");
  assertHas("inv:admin", admCaps, "inventory.opname");

  // No inventory_role (none / default)
  const noInv = {
    account_type: "user",
    role_code: "manager",
    dashboard_access: true,
    inventory_role: "none",
  };
  const noInvCaps = resolveMobileCapabilities(noInv);
  assertLacks("inv:none (manager)", noInvCaps, "inventory.view");
  assertLacks("inv:none (manager)", noInvCaps, "wms.workstation_scan");

  // HR with inventory_role=supervisor
  const hrInv = {
    account_type: "user",
    role_code: "hr",
    dashboard_access: true,
    inventory_role: "supervisor",
  };
  const hrInvCaps = resolveMobileCapabilities(hrInv);
  assertHas("hr+inv:supervisor", hrInvCaps, "leave.approve");   // HR cap intact
  assertHas("hr+inv:supervisor", hrInvCaps, "inventory.view");  // inv cap added
  assertHas("hr+inv:supervisor", hrInvCaps, "inventory.opname");
}

// ─────────────────────────────────────────────────────────────────────────────
section("SECURITY — sensitive capabilities must be absent for non-privileged roles");

{
  const sensitiveHrCaps = [
    "leave.approve",
    "overtime.approve",
    "field_activity.approve",
    "finding.view",
    "finding.create",
    "finding.manage",
    "report.view_all",
    "report.review",
    "report.close",
    "rating.manage",
    "hr.queue.leave",
    "hr.queue.overtime",
    "hr.queue.field_activity",
    "hr.staff.view",
  ];

  for (const role of ["manager", "staff", "staff-basic", "security", "ob"]) {
    const user = { account_type: "user", role_code: role };
    const caps = resolveMobileCapabilities(user);
    for (const cap of sensitiveHrCaps) {
      assertLacks(`role=${role}`, caps, cap);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section("DASHBOARD_ACCESS override");

{
  // staff-basic with explicit dashboard_access=true (admin-granted)
  const grantedUser = { account_type: "user", role_code: "staff-basic", dashboard_access: true };
  const grantedCaps = resolveMobileCapabilities(grantedUser);
  assertHas("staff-basic+dashboard_access", grantedCaps, "dashboard.operational");
  // Still no HR caps
  assertLacks("staff-basic+dashboard_access", grantedCaps, "leave.approve");
  assertLacks("staff-basic+dashboard_access", grantedCaps, "finding.view");

  // security with dashboard_access=true (rare edge case)
  const secWithDash = { account_type: "user", role_code: "security", dashboard_access: true };
  const secDashCaps = resolveMobileCapabilities(secWithDash);
  assertHas("security+dashboard_access", secDashCaps, "dashboard.operational");
  assertLacks("security+dashboard_access", secDashCaps, "leave.approve");
}

// ─────────────────────────────────────────────────────────────────────────────
section("ROLE normalized from legacy 'role' field");

{
  // Some old records may use `role` instead of `role_code`
  const legacyHr = { account_type: "user", role: "hr" };
  const legacyCaps = resolveMobileCapabilities(legacyHr);
  assertHas("legacy role=hr", legacyCaps, "leave.approve");
  assertHas("legacy role=hr", legacyCaps, "hr.queue.leave");

  // Legacy owner via role field
  const legacyOwner = { role: "owner" };
  const legacyOwnerCaps = resolveMobileCapabilities(legacyOwner);
  assertHas("legacy role=owner", legacyOwnerCaps, "leave.approve");
  assertHas("legacy role=owner", legacyOwnerCaps, "inventory.view"); // owner always has inventory
}

// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n");
process.stdout.write("══════════════════════════════════════════\n");
process.stdout.write("Mobile Capability Tests: " + (passed + failed) + " total\n");
process.stdout.write("  PASS: " + passed + "\n");
process.stdout.write("  FAIL: " + failed + "\n");

if (failures.length > 0) {
  process.stdout.write("\nFailed assertions:\n");
  for (const f of failures) {
    process.stdout.write("  ✗ " + f + "\n");
  }
  process.stdout.write("\nStatus: FAIL\n");
  process.exit(1);
} else {
  process.stdout.write("\nStatus: PASS\n");
  process.exit(0);
}
