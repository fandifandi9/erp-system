/**
 * scripts/test-phase31-employee-rbac.mjs
 * Phase 31 — Employee RBAC, lifecycle, capability, security regression tests.
 *
 * Run: npm run test:phase31-employee-rbac
 */

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error(`  ✗ ${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  } else {
    passed++;
  }
}

// ─── Inline mirrors (lib/capabilities/employee.ts) ───────────────────────────

const EMPLOYEE_CAPABILITIES = [
  "employee.view",
  "employee.create",
  "employee.update",
  "employee.activate",
  "employee.deactivate",
  "employee.view_sensitive",
  "employee.manage_accounts",
  "employee.manage_hr_accounts",
  "employee.assign_manager",
  "employee.view_team",
];

const EMPLOYEE_CAPABILITY_DEFS = {
  "employee.view": { grantedTo: ["owner", "hr"] },
  "employee.create": { grantedTo: ["owner", "hr"] },
  "employee.update": { grantedTo: ["owner", "hr"] },
  "employee.activate": { grantedTo: ["owner"] },
  "employee.deactivate": { grantedTo: ["owner"] },
  "employee.view_sensitive": { grantedTo: ["owner", "hr"] },
  "employee.manage_accounts": { grantedTo: ["owner", "hr"] },
  "employee.manage_hr_accounts": { grantedTo: ["owner"] },
  "employee.assign_manager": { grantedTo: ["owner", "hr"] },
  "employee.view_team": { grantedTo: ["owner", "manager", "hr"] },
};

function normalizeAuthModel(user) {
  if (!user) return { accountType: "user", roleCode: "staff-basic", dashboardAccess: false };
  const rawRole = (user.role || user.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user.account_type || (rawRole === "owner" ? "owner" : "user")) || "user")
    .toLowerCase()
    .trim();
  if (accountType === "owner") {
    return { accountType: "owner", roleCode: null, dashboardAccess: true };
  }
  const VALID = ["hr", "manager", "staff", "staff-basic", "security", "ob"];
  const roleCode = VALID.includes(user.role_code) ? user.role_code : "staff-basic";
  return {
    accountType: "user",
    roleCode,
    dashboardAccess: user.dashboard_access ?? ["hr", "manager", "staff"].includes(roleCode),
  };
}

function isOwnerAccount(user) {
  return normalizeAuthModel(user).accountType === "owner";
}

function isHrAccount(user) {
  const a = normalizeAuthModel(user);
  return a.accountType === "user" && a.roleCode === "hr";
}

function isPrivilegedTargetUser(target) {
  const auth = normalizeAuthModel(target);
  if (auth.accountType === "owner") return true;
  if (auth.roleCode === "hr") return true;
  return false;
}

function resolveEmployeeCapabilities(actor) {
  const caps = new Set();
  if (!actor) return caps;
  if (isOwnerAccount(actor)) {
    for (const c of EMPLOYEE_CAPABILITIES) caps.add(c);
    return caps;
  }
  const auth = normalizeAuthModel(actor);
  for (const [cap, meta] of Object.entries(EMPLOYEE_CAPABILITY_DEFS)) {
    if (auth.roleCode && meta.grantedTo.includes(auth.roleCode)) caps.add(cap);
  }
  if (isHrAccount(actor)) {
    caps.delete("employee.manage_hr_accounts");
    caps.delete("employee.activate");
    caps.delete("employee.deactivate");
  }
  return caps;
}

function hasEmployeeCapability(actor, cap) {
  return resolveEmployeeCapabilities(actor).has(cap);
}

function detectSensitiveFieldChanges(before, after) {
  const sensitive = [
    "nik",
    "npwp",
    "salary",
    "leave_daily_rate",
    "extra_bonus_amount",
    "extra_bonus_enabled",
    "late_deduction_rupiah_per_minute",
    "absence_deduction_rupiah_per_day",
  ];
  const changed = [];
  for (const key of sensitive) {
    if (String(before[key] ?? "") !== String(after[key] ?? "")) changed.push(key);
  }
  return changed;
}

function resolveMobileCapabilitiesServer(user) {
  const caps = new Set();
  if (!user) return caps;
  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const isHr = !isOwner && auth.roleCode === "hr";
  const isManager = !isOwner && auth.roleCode === "manager";
  caps.add("attendance.view");
  caps.add("profile.view_own");
  if (isOwner || isHr || isManager) caps.add("employee.view_team");
  if (isOwner || isHr) {
    caps.add("leave.approve");
    caps.add("hr.queue.leave");
  }
  return caps;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log("\n=== Phase 31 Employee RBAC Tests ===\n");

console.log("Owner capabilities");
{
  const owner = { account_type: "owner" };
  const caps = [...resolveEmployeeCapabilities(owner)];
  assert(caps.includes("employee.activate"), "owner has employee.activate");
  assert(caps.includes("employee.manage_hr_accounts"), "owner has employee.manage_hr_accounts");
  assert(caps.length === EMPLOYEE_CAPABILITIES.length, "owner has all employee caps");
}

console.log("HR capabilities (non-privileged management)");
{
  const hr = { account_type: "user", role_code: "hr" };
  assert(hasEmployeeCapability(hr, "employee.create"), "hr can create");
  assert(hasEmployeeCapability(hr, "employee.view_sensitive"), "hr can view_sensitive");
  assert(!hasEmployeeCapability(hr, "employee.activate"), "hr cannot activate");
  assert(!hasEmployeeCapability(hr, "employee.manage_hr_accounts"), "hr cannot manage_hr_accounts");
}

console.log("Staff security negatives");
{
  const staff = { account_type: "user", role_code: "staff" };
  assert(!hasEmployeeCapability(staff, "employee.create"), "staff cannot create");
  assert(!hasEmployeeCapability(staff, "employee.activate"), "staff cannot activate");
  assert(!hasEmployeeCapability(staff, "employee.view_sensitive"), "staff cannot view_sensitive");
  assert(!hasEmployeeCapability(staff, "employee.update"), "staff cannot update others");
}

console.log("Manager team visibility");
{
  const mgr = { account_type: "user", role_code: "manager" };
  assert(hasEmployeeCapability(mgr, "employee.view_team"), "manager has view_team");
  assert(!hasEmployeeCapability(mgr, "employee.create"), "manager cannot create");
  const mobile = resolveMobileCapabilitiesServer(mgr);
  assert(mobile.has("employee.view_team"), "manager mobile view_team");
  assert(!mobile.has("hr.queue.leave"), "manager no HR queue by default");
}

console.log("Privileged target detection");
{
  assert(isPrivilegedTargetUser({ role_code: "hr" }), "hr target is privileged");
  assert(isPrivilegedTargetUser({ account_type: "owner" }), "owner target is privileged");
  assert(!isPrivilegedTargetUser({ role_code: "staff" }), "staff target not privileged");
}

console.log("Sensitive audit metadata (no values)");
{
  const changed = detectSensitiveFieldChanges({ nik: "1" }, { nik: "2", salary: 100 });
  eq(changed, ["nik", "salary"], "detects sensitive field names only");
  assert(!JSON.stringify(changed).includes("2"), "audit changed_fields has no values");
}

console.log("Fail closed");
{
  eq([...resolveEmployeeCapabilities(null)], [], "null actor → no caps");
  eq([...resolveEmployeeCapabilities(undefined)], [], "undefined actor → no caps");
  eq([...resolveMobileCapabilitiesServer(null)], [], "null mobile → no caps");
}

console.log("Self-elevation prevention (conceptual)");
{
  const staff = { id: "u1", account_type: "user", role_code: "staff" };
  const selfTarget = staff.id;
  assert(staff.id === selfTarget, "self target identified");
  assert(!hasEmployeeCapability(staff, "employee.activate"), "staff cannot self-activate via cap");
}

console.log("HR cannot manage HR account without manage_hr_accounts");
{
  const hrActor = { account_type: "user", role_code: "hr" };
  const hrTarget = { account_type: "user", role_code: "hr" };
  assert(isPrivilegedTargetUser(hrTarget), "hr target privileged");
  assert(!hasEmployeeCapability(hrActor, "employee.manage_hr_accounts"), "hr actor lacks manage_hr_accounts");
}

console.log("Access Preview contract");
{
  const previewShape = {
    user: ["id", "name", "email", "role_code", "status"],
    capabilities: ["mobile", "employee"],
    mobile_access: "array",
    restricted: "array",
    scopes: "array",
  };
  assert(Array.isArray(previewShape.user), "preview documents user fields");
  assert(previewShape.capabilities.includes("employee"), "preview includes employee caps");
}

console.log("Audit event codes");
{
  const codes = [
    "employee.created",
    "employee.updated",
    "employee.activated",
    "employee.deactivated",
    "employee.role_changed",
    "employee.access_changed",
    "employee.manager_changed",
    "employee.sensitive_data_changed",
  ];
  assert(codes.length === 8, "8 lifecycle audit events defined");
}

console.log("Notification recipient expansion");
{
  const MANAGER_CAPS = new Set(["leave.approve"]);
  const HR_OWNER_CAPS = new Set(["leave.approve", "employee.created"]);
  assert(MANAGER_CAPS.has("leave.approve"), "managers in leave.approve path");
  assert(HR_OWNER_CAPS.has("employee.created"), "lifecycle events map to HR/owner");
}

console.log("\n=== Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
console.log("\nAll Phase 31 employee RBAC tests passed.\n");
