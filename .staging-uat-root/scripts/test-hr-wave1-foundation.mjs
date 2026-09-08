/**
 * Wave 1 HR security foundation tests (no production data writes).
 *
 * Unit: canonical auth + company scope + privilege field rejection (mirrors lib/).
 * HTTP: GET/POST /api/hr/auth-context against local next (if running).
 *
 * Usage:
 *   node scripts/test-hr-wave1-foundation.mjs
 *   BASE_URL=http://localhost:3000 node scripts/test-hr-wave1-foundation.mjs
 */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Mirror of lib/auth-model normalize + helpers (keep in sync). */
function normalizeAuthModel(user) {
  const rawRole = (user?.role || user?.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user?.account_type || (rawRole === "owner" ? "owner" : "user")) + "")
    .toLowerCase()
    .trim();
  if (accountType === "owner") {
    return { accountType: "owner", roleCode: null, dashboardAccess: true };
  }
  const valid = ["hr", "manager", "staff", "staff-basic", "security", "ob"];
  const fromCode = valid.includes((user?.role_code || "").toString().toLowerCase().trim())
    ? (user.role_code + "").toLowerCase().trim()
    : null;
  const fromRole = valid.includes(rawRole) ? rawRole : null;
  return {
    accountType: "user",
    roleCode: fromCode || fromRole || "staff-basic",
    dashboardAccess: true,
  };
}

function isOwnerAccount(user) {
  return normalizeAuthModel(user).accountType === "owner";
}
function isHrAccount(user) {
  const a = normalizeAuthModel(user);
  return a.accountType === "user" && a.roleCode === "hr";
}
function isCompanyInScope(companyId, accessible) {
  const id = (companyId ?? "").trim();
  if (!id || !Array.isArray(accessible) || accessible.length === 0) return false;
  return accessible.includes(id);
}
function rejectClientPrivilegeFields(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "account_type",
    "role",
    "role_code",
    "hr_action_by",
    "hr_action_name",
    "hr_action_at",
    "approved_by",
    "approved_at",
    "rejected_by",
    "rejected_at",
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const err = new Error(`Field '${key}' tidak boleh dikirim oleh klien.`);
      err.status = 400;
      throw err;
    }
  }
}

const results = [];

function record(id, expected, actual, pass) {
  results.push({ id, expected, actual, pass: !!pass });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${id}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
}

// --- Unit: A Owner ---
{
  const u = { account_type: "owner", role: "owner", role_code: null };
  const pass = isOwnerAccount(u) && !isHrAccount(u);
  record("A. Owner authentication (canonical)", "isOwner=true, isHr=false", `isOwner=${isOwnerAccount(u)}, isHr=${isHrAccount(u)}`, pass);
}

// --- Unit: B HR ---
{
  const u = { account_type: "user", role_code: "hr", role: "hr" };
  const pass = !isOwnerAccount(u) && isHrAccount(u);
  record("B. HR authentication (canonical)", "isOwner=false, isHr=true", `isOwner=${isOwnerAccount(u)}, isHr=${isHrAccount(u)}`, pass);
}

// --- Unit: C Staff ---
{
  const u = { account_type: "user", role_code: "staff", role: "staff" };
  const pass = !isOwnerAccount(u) && !isHrAccount(u);
  record("C. Staff authentication (canonical)", "isOwner=false, isHr=false", `isOwner=${isOwnerAccount(u)}, isHr=${isHrAccount(u)}`, pass);
}

// --- Unit: G invalid role falls back staff-basic, not HR ---
{
  const u = { account_type: "user", role_code: "god-mode", role: "admin" };
  const auth = normalizeAuthModel(u);
  const pass = auth.roleCode === "staff-basic" && !isHrAccount(u);
  record("G. Invalid role", "roleCode=staff-basic, isHr=false", `roleCode=${auth.roleCode}, isHr=${isHrAccount(u)}`, pass);
}

// --- Unit: H missing company membership ---
{
  const pass = !isCompanyInScope("co1", []) && !isCompanyInScope("", ["co1"]);
  record("H. Missing company membership (fail closed)", "false", String(pass ? "denied" : "allowed"), pass);
}

// --- Unit: E HR company scope ---
{
  const hrCompanies = ["c-a"];
  const pass = isCompanyInScope("c-a", hrCompanies) && !isCompanyInScope("c-b", hrCompanies);
  record("E. HR company scope", "c-a allow, c-b deny", pass ? "ok" : "leak", pass);
}

// --- Unit: F Owner company scope (simulated all) ---
{
  const ownerCompanies = ["c-a", "c-b", "c-c"];
  const pass = ownerCompanies.every((id) => isCompanyInScope(id, ownerCompanies));
  record("F. Owner company scope", "all listed allow", pass ? "ok" : "fail", pass);
}

// --- Unit: I forged userId (body ignored by contract helper — privilege fields) ---
{
  let rejected = false;
  try {
    rejectClientPrivilegeFields({ role: "owner" });
  } catch {
    rejected = true;
  }
  record("J. Forged role in body", "reject 400", rejected ? "rejected" : "accepted", rejected);
}

{
  let rejected = false;
  try {
    rejectClientPrivilegeFields({ account_type: "owner" });
  } catch {
    rejected = true;
  }
  record("I/J. Forged account_type in body", "reject 400", rejected ? "rejected" : "accepted", rejected);
}

{
  let rejected = false;
  try {
    rejectClientPrivilegeFields({ hr_action_by: "fake" });
  } catch {
    rejected = true;
  }
  record("I. Forged hr_action_by (actor)", "reject 400", rejected ? "rejected" : "accepted", rejected);
}

{
  // companyId in body is not a privilege field list item — scope must still fail closed via isCompanyInScope
  const clientClaimed = "forged-company";
  const serverScope = ["real-company"];
  const pass = !isCompanyInScope(clientClaimed, serverScope);
  record("K. Forged companyId vs server scope", "deny", pass ? "denied" : "allowed", pass);
}

// Legacy role alone without account_type: owner via legacy rawRole
{
  const u = { role: "owner" };
  const pass = isOwnerAccount(u);
  record("Compat. Legacy role=owner without account_type", "isOwner=true", `isOwner=${isOwnerAccount(u)}`, pass);
}

// Security: role=hr without account_type user still HR via fallback
{
  const u = { role: "hr" };
  const pass = isHrAccount(u);
  record("Compat. Legacy role=hr", "isHr=true", `isHr=${isHrAccount(u)}`, pass);
}

// Security-critical: do NOT treat role=hr when account_type is owner as HR-only path — owner is owner
{
  const u = { account_type: "owner", role: "hr", role_code: "hr" };
  const pass = isOwnerAccount(u) && !isHrAccount(u);
  record("Canonical. Owner wins over role_code hr", "owner not hr", `isOwner=${isOwnerAccount(u)}, isHr=${isHrAccount(u)}`, pass);
}

async function httpTests() {
  // D. unauthenticated
  try {
    const res = await fetch(`${BASE_URL}/api/hr/auth-context`, { method: "GET" });
    const pass = res.status === 401;
    record("D. Unauthenticated GET /api/hr/auth-context", "401", String(res.status), pass);
  } catch (e) {
    record("D. Unauthenticated GET /api/hr/auth-context", "401", `ERROR: ${e.message} (is next running?)`, false);
  }

  // POST forged role without auth → 401 first
  try {
    const res = await fetch(`${BASE_URL}/api/hr/auth-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "owner", userId: "forged", company_id: "x" }),
    });
    const pass = res.status === 401;
    record("D2. Unauthenticated POST with forged privilege body", "401", String(res.status), pass);
  } catch (e) {
    record("D2. Unauthenticated POST with forged privilege body", "401", `ERROR: ${e.message}`, false);
  }
}

await httpTests();

const failed = results.filter((r) => !r.pass).length;
console.log("\n--- Summary ---");
console.log(`Total: ${results.length}  PASS: ${results.length - failed}  FAIL: ${failed}`);
console.log("Note: Live Owner/HR/Staff session HTTP checks need real cookies — run manually after login.");
console.log("Live PocketBase rules: NOT VERIFIED.");

process.exit(failed > 0 ? 1 : 0);
