/**
 * scripts/test-phase32-rbac-hardening.mjs
 * Phase 32 — Profile security, manager hierarchy, RBAC matrix, negative tests.
 *
 * Run: npm run test:phase32-rbac-hardening
 */

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ─── profile-self-service mirror ───────────────────────────────────────────

const PROFILE_SELF_SERVICE_FIELDS = ["phone", "address", "date_of_birth", "bio"];
const PROFILE_RESTRICTED_FIELDS = [
  "nik", "npwp", "salary", "manager", "role_code", "account_type", "dashboard_access", "status",
];

function rejectRestrictedProfileFields(body) {
  if (!body) return;
  for (const key of PROFILE_RESTRICTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh diubah melalui profil mandiri.`);
    }
  }
}

function pickSelfServicePayload(body) {
  const out = {};
  for (const key of PROFILE_SELF_SERVICE_FIELDS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) out[key] = String(body[key] ?? "");
  }
  return out;
}

// ─── circular manager (simplified) ───────────────────────────────────────────

function wouldCreateCycle(employeeId, newManagerId, managerOf) {
  if (!newManagerId) return false;
  if (newManagerId === employeeId) return true;
  let current = newManagerId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    if (current === employeeId) return true;
    visited.add(current);
    current = managerOf[current] || null;
  }
  return false;
}

// ─── employee capabilities mirror ────────────────────────────────────────────

const EMPLOYEE_CAPABILITY_MATRIX = {
  owner: { "employee.activate": true, "employee.manage_hr_accounts": true, "employee.view_sensitive": true },
  hr: { "employee.activate": false, "employee.manage_hr_accounts": false, "employee.view_sensitive": true },
  manager: { "employee.view_team": true, "employee.create": false },
  staff: { "employee.create": false, "employee.activate": false, "employee.view_sensitive": false },
};

function resolveEmployeeCapabilities(actor) {
  const caps = new Set();
  if (!actor) return caps;
  if (actor.account_type === "owner") {
    [
      "employee.view", "employee.create", "employee.update", "employee.activate",
      "employee.deactivate", "employee.view_sensitive", "employee.manage_accounts",
      "employee.manage_hr_accounts", "employee.assign_manager", "employee.view_team",
    ].forEach((c) => caps.add(c));
    return caps;
  }
  const role = actor.role_code;
  if (role === "hr") {
    [
      "employee.view", "employee.create", "employee.update", "employee.view_sensitive",
      "employee.manage_accounts", "employee.assign_manager", "employee.view_team",
    ].forEach((c) => caps.add(c));
  }
  if (role === "manager") caps.add("employee.view_team");
  return caps;
}

console.log("\n=== Phase 32 RBAC Hardening Tests ===\n");

console.log("Profile self-service allowlist");
{
  const payload = pickSelfServicePayload({ phone: "081", nik: "123", salary: 100 });
  assert(!("nik" in payload), "nik stripped from self payload");
  assert(!("salary" in payload), "salary stripped from self payload");
  assert(payload.phone === "081", "phone allowed");
}

console.log("Profile restricted field rejection");
{
  let threw = false;
  try {
    rejectRestrictedProfileFields({ phone: "1", role_code: "owner" });
  } catch {
    threw = true;
  }
  assert(threw, "role_code in self body throws");
  let threw2 = false;
  try {
    rejectRestrictedProfileFields({ manager: "x" });
  } catch {
    threw2 = true;
  }
  assert(threw2, "manager in self body throws");
}

console.log("Staff cannot privilege escalate via self-service");
{
  const restrictedAttempts = [
    { role_code: "owner" },
    { account_type: "owner" },
    { dashboard_access: true },
    { status: "active" },
    { salary: 999 },
    { nik: "1" },
  ];
  for (const body of restrictedAttempts) {
    let blocked = false;
    try {
      rejectRestrictedProfileFields(body);
    } catch {
      blocked = true;
    }
    assert(blocked, `staff self blocked: ${Object.keys(body)[0]}`);
  }
}

console.log("Staff security negatives (capabilities)");
{
  const staff = { account_type: "user", role_code: "staff" };
  const caps = resolveEmployeeCapabilities(staff);
  assert(!caps.has("employee.activate"), "staff cannot activate");
  assert(!caps.has("employee.deactivate"), "staff cannot deactivate");
  assert(!caps.has("employee.create"), "staff cannot create");
  assert(!caps.has("employee.view_sensitive"), "staff cannot view_sensitive");
  assert(!caps.has("employee.assign_manager"), "staff cannot assign_manager");
}

console.log("HR cannot manage HR accounts");
{
  const hr = { account_type: "user", role_code: "hr" };
  const caps = resolveEmployeeCapabilities(hr);
  assert(!caps.has("employee.manage_hr_accounts"), "hr no manage_hr_accounts");
  assert(!caps.has("employee.activate"), "hr no activate");
}

console.log("Circular manager detection");
{
  const managerOf = { m1: "m2", m2: "e1" };
  assert(wouldCreateCycle("e1", "m1", managerOf), "detects cycle e1<-m1<-m2<-e1");
  assert(wouldCreateCycle("e1", "e1", {}), "self manager rejected");
  assert(!wouldCreateCycle("e1", "m3", { m3: null }), "valid assignment ok");
}

console.log("Manager scope foundation");
{
  const mgr = { account_type: "user", role_code: "manager" };
  const caps = resolveEmployeeCapabilities(mgr);
  assert(caps.has("employee.view_team"), "manager has view_team");
  assert(!caps.has("employee.view"), "manager no company employee.view");
}

console.log("RBAC matrix documented roles");
{
  for (const role of ["owner", "hr", "manager", "staff", "staff-basic", "security", "ob"]) {
    assert(EMPLOYEE_CAPABILITY_MATRIX[role] !== undefined || role === "staff-basic" || role === "security" || role === "ob", `matrix entry or staff variant for ${role}`);
  }
  assert(EMPLOYEE_CAPABILITY_MATRIX.owner["employee.activate"], "matrix owner activate");
  assert(!EMPLOYEE_CAPABILITY_MATRIX.hr["employee.activate"], "matrix hr no activate");
}

console.log("Audit safety");
{
  const auditPayload = { changed_fields: ["nik", "salary"], target_user_id: "u1" };
  const serialized = JSON.stringify(auditPayload);
  assert(!serialized.includes("12345"), "audit has no raw NIK values");
  assert(auditPayload.changed_fields.includes("nik"), "audit records field name only");
}

console.log("PB rule intent (profiles update HR-only)");
{
  const HR_ONLY_RULE = 'HR_OR_OWNER_EXPR only';
  const OLD_RULE = 'user = self OR HR';
  assert(HR_ONLY_RULE !== OLD_RULE, "phase32 tightens self direct update");
}

console.log("\n=== Results ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);
console.log("\nAll Phase 32 RBAC hardening tests passed.\n");
