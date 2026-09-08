/**
 * scripts/test-phase33a-user-privilege.mjs
 * Phase 33A — User privilege & account security hardening tests.
 *
 * Run: npm run test:phase33a-user-privilege
 * Requires: local PB (:8090) with Phase 33A migration applied.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  USER_PRIVILEGE_FIELD_NAMES,
  USER_PASSWORD_FIELD_NAMES,
  buildUsersUpdateRulePbExpression,
} from "./pb-user-privilege-rule.mjs";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const get = (k) => {
      const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
      if (!m) return "";
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    };
    return {
      url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
      adminEmail: get("POCKETBASE_ADMIN_EMAIL"),
      adminPass: get("POCKETBASE_ADMIN_PASSWORD"),
      smokePass: get("SMOKE_PASSWORD") || "SerbaSmoke2026!",
      smokeDomain: get("SMOKE_EMAIL_DOMAIN") || "serba.test",
    };
  }
  return { url: "", adminEmail: "", adminPass: "", smokePass: "SerbaSmoke2026!", smokeDomain: "serba.test" };
}

// ─── Mirror rejectClientPrivilegeFields ─────────────────────────────────────

function rejectClientPrivilegeFields(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    ...USER_PRIVILEGE_FIELD_NAMES,
    ...USER_PASSWORD_FIELD_NAMES,
    "session_nonce",
    "mobile_session_nonce",
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh dikirim oleh klien.`);
    }
  }
}

function rejectClientEmployeeMutationForgeryFields(body, options = {}) {
  if (!body || typeof body !== "object") return;
  const identityForgery = [
    "account_type",
    "role",
    "role_code",
    "status",
    "inventory_role",
    "hr_role_preset",
    "web_access",
    "active_company",
    "default_company",
    "active_store",
    "default_store",
    "active_warehouse",
    "default_warehouse",
    "is_checked_in",
    "shift_active",
    "last_checkin",
    "last_checkout",
    "locale",
    "session_nonce",
    "mobile_session_nonce",
    "hr_action_by",
    "hr_action_name",
    "hr_action_at",
    "approved_by",
    "approved_at",
    "rejected_by",
    "rejected_at",
  ];
  const forbidden = [...identityForgery];
  if (!options.allowPassword) {
    forbidden.push(...USER_PASSWORD_FIELD_NAMES);
  }
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new Error(`Field '${key}' tidak boleh dikirim oleh klien.`);
    }
  }
}

// ─── Mirror employee capabilities (subset) ────────────────────────────────────

function hasEmployeeCapability(user, cap) {
  if (!user) return false;
  if (user.account_type === "owner" || user.role === "owner") return true;
  const role = user.role_code || user.role;
  const hrCaps = new Set([
    "employee.view",
    "employee.create",
    "employee.update",
    "employee.view_sensitive",
    "employee.manage_accounts",
    "employee.assign_manager",
    "employee.view_team",
  ]);
  if (role === "hr") return hrCaps.has(cap);
  if (role === "manager") return cap === "employee.view_team";
  return false;
}

function assertNotSelfTarget(actorId, targetId) {
  if (actorId === targetId) throw new Error("Tidak dapat mengubah akses akun sendiri.");
}

function assertCanManageTargetAccount(actor, target, action) {
  assertNotSelfTarget(actor.id, String(target.id || ""));
  const privileged =
    target.account_type === "owner" ||
    target.role === "owner" ||
    target.role_code === "hr" ||
    target.role === "hr";
  if (privileged && !hasEmployeeCapability(actor, "employee.manage_hr_accounts")) {
    throw new Error("Akun privileged hanya dapat dikelola oleh Owner.");
  }
  if (action === "activate" && !hasEmployeeCapability(actor, "employee.activate")) {
    throw new Error("Tidak berwenang mengaktifkan.");
  }
  if (action === "deactivate" && !hasEmployeeCapability(actor, "employee.deactivate")) {
    throw new Error("Tidak berwenang menonaktifkan.");
  }
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

console.log("\n=== Phase 33A User Privilege Hardening Tests ===\n");

console.log("users.updateRule expression");
{
  const rule = buildUsersUpdateRulePbExpression();
  assert(rule.includes("@request.data.role:isset = false"), "blocks role on self");
  assert(rule.includes("@request.data.role_code:isset = false"), "blocks role_code on self");
  assert(rule.includes("@request.data.dashboard_access:isset = false"), "blocks dashboard_access");
  assert(rule.includes("@request.data.password:isset = false"), "blocks password on self PB");
  assert(rule.includes("account_type = \"owner\""), "owner bypass present");
  assert(!rule.includes("role_code = \"hr\""), "HR no longer has client update on users");
}

console.log("API body privilege rejection");
{
  const attempts = [
    { role: "owner" },
    { role_code: "hr" },
    { account_type: "owner" },
    { dashboard_access: true },
    { status: "active" },
    { inventory_role: "admin" },
    { hr_role_preset: "hr" },
    { active_company: "x" },
    { session_nonce: "n" },
    { password: "x" },
  ];
  for (const body of attempts) {
    let threw = false;
    try {
      rejectClientPrivilegeFields(body);
    } catch {
      threw = true;
    }
    assert(threw, `reject forged field ${Object.keys(body)[0]}`);
  }
}

console.log("HR employee mutation forgery rejection");
{
  const allowed = [
    { dashboard_access: true, role_preset_id: "preset1" },
    { name: "FN2", email: "fn2@test.com", password: "Secret123!", dashboard_access: false },
  ];
  for (const body of allowed) {
    rejectClientEmployeeMutationForgeryFields(body, { allowPassword: true });
    assert(true, `allows employee fields ${Object.keys(body).join(",")}`);
  }

  const blocked = [{ role_code: "owner" }, { status: "active" }, { password: "x" }];
  for (const body of blocked) {
    let threw = false;
    try {
      rejectClientEmployeeMutationForgeryFields(body);
    } catch {
      threw = true;
    }
    assert(threw, `employee route rejects forged field ${Object.keys(body)[0]}`);
  }
}

console.log("Staff cannot privilege escalate (logic)");
{
  const staff = { id: "s1", role_code: "staff", account_type: "user" };
  assert(!hasEmployeeCapability(staff, "employee.manage_accounts"), "staff lacks manage_accounts");
  assert(!hasEmployeeCapability(staff, "employee.activate"), "staff lacks activate");
}

console.log("HR cannot grant itself HR-management capability");
{
  const hr = { id: "h1", role_code: "hr", account_type: "user" };
  assert(!hasEmployeeCapability(hr, "employee.manage_hr_accounts"), "HR lacks manage_hr_accounts");
  assert(!hasEmployeeCapability(hr, "employee.activate"), "HR lacks activate");
}

console.log("HR cannot manage privileged target without owner capability");
{
  const hr = { id: "h1", role_code: "hr", account_type: "user" };
  const ownerTarget = { id: "o1", account_type: "owner", role: "owner" };
  let threw = false;
  try {
    assertCanManageTargetAccount(hr, ownerTarget, "update");
  } catch {
    threw = true;
  }
  assert(threw, "HR cannot update owner target");
}

console.log("User cannot modify own privilege via HR API guard");
{
  const hr = { id: "h1", role_code: "hr", account_type: "user" };
  let threw = false;
  try {
    assertNotSelfTarget("h1", "h1");
  } catch {
    threw = true;
  }
  assert(threw, "self-target blocked for privilege mutation");
}

console.log("Manager cannot elevate own privilege");
{
  const mgr = { id: "m1", role_code: "manager", account_type: "user" };
  assert(!hasEmployeeCapability(mgr, "employee.manage_accounts"), "manager lacks manage_accounts");
}

console.log("Owner authorized operations (positive)");
{
  const owner = { id: "o1", account_type: "owner", role: "owner" };
  assert(hasEmployeeCapability(owner, "employee.activate"), "owner can activate");
  assert(hasEmployeeCapability(owner, "employee.manage_hr_accounts"), "owner can manage HR accounts");
}

console.log("Privilege field inventory");
{
  assert(USER_PRIVILEGE_FIELD_NAMES.includes("role"), "role in privilege list");
  assert(USER_PRIVILEGE_FIELD_NAMES.includes("web_access"), "web_access in privilege list");
  assert(USER_PRIVILEGE_FIELD_NAMES.length >= 20, "comprehensive privilege list");
}

// ─── Live PocketBase tests (optional) ─────────────────────────────────────────

const env = loadEnv();
const BASE = env.url;

async function apiPost(pathSuffix, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = token;
  const r = await fetch(`${BASE}${pathSuffix}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function apiPatch(pathSuffix, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = token;
  const r = await fetch(`${BASE}${pathSuffix}`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

const isLocalPb =
  BASE &&
  !BASE.includes("serba.space") &&
  !BASE.includes(":8091") &&
  !BASE.includes(":8092");

if (!isLocalPb) {
  console.log("\nLive PB tests SKIPPED (not local :8090)");
} else {
  console.log("\nLive PocketBase privilege enforcement");

  const adminAuth = await apiPost("/api/admins/auth-with-password", {
    identity: env.adminEmail,
    password: env.adminPass,
  });
  if (!adminAuth.data?.token) {
    console.log("  ⚠ SKIP live tests — admin auth failed");
  } else {
    const adminToken = adminAuth.data.token;

    const colRes = await fetch(`${BASE}/api/collections/users`, {
      headers: { Authorization: adminToken },
    });
    const col = await colRes.json();
    const expectedRule = buildUsersUpdateRulePbExpression();
    assert(col.updateRule === expectedRule, "users.updateRule matches Phase 33A (run migrate:local-hr-phase33a)");

    async function login(email, password) {
      const r = await apiPost("/api/collections/users/auth-with-password", { identity: email, password });
      return r.data?.token ? r : null;
    }

    /** PocketBase may return 403, 400, or 404 when updateRule denies the patch. */
    function denied(status) {
      return status !== 200 && status !== 204;
    }

    const staffEmail = `smoke-employee@${env.smokeDomain}`;
    const hrEmail = `smoke-hr@${env.smokeDomain}`;
    const staffLogin = await login(staffEmail, env.smokePass);
    const hrLogin = await login(hrEmail, env.smokePass);

    if (!staffLogin?.data?.token) {
      console.log("  ⚠ SKIP staff live tests — run npm run smoke:seed");
    } else {
      const staffId = staffLogin.data.record.id;
      const staffToken = staffLogin.data.token;

      const rolePatch = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { role_code: "owner", role: "owner" },
        staffToken,
      );
      assert(denied(rolePatch.status), "staff cannot change own role_code via PB");

      const dashPatch = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { dashboard_access: true },
        staffToken,
      );
      assert(denied(dashPatch.status), "staff cannot grant dashboard_access");

      const statusPatch = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { status: "active" },
        staffToken,
      );
      assert(denied(statusPatch.status), "staff cannot activate self via PB");

      const pwdPatch = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { password: "NewPass123!", passwordConfirm: "NewPass123!" },
        staffToken,
      );
      assert(denied(pwdPatch.status), "staff cannot change password via PB client");

      const noncePatch = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { session_nonce: crypto.randomUUID() },
        staffToken,
      );
      assert(noncePatch.status === 200, "staff can rotate session_nonce via PB client");
    }

    if (!hrLogin?.data?.token || !staffLogin?.data?.token) {
      console.log("  ⚠ SKIP HR cross-user live tests");
    } else {
      const staffId = staffLogin.data.record.id;
      const hrToken = hrLogin.data.token;

      const hrSelfRole = await apiPatch(
        `/api/collections/users/records/${hrLogin.data.record.id}`,
        { role_code: "owner" },
        hrToken,
      );
      assert(denied(hrSelfRole.status), "HR cannot elevate own role via PB");

      const hrOther = await apiPatch(
        `/api/collections/users/records/${staffId}`,
        { status: "inactive" },
        hrToken,
      );
      assert(denied(hrOther.status), "HR cannot deactivate another user via PB client");

      const hrCompany = await apiPatch(
        `/api/collections/users/records/${hrLogin.data.record.id}`,
        { active_company: "fake-company-id" },
        hrToken,
      );
      assert(denied(hrCompany.status), "HR cannot modify company scope via PB");
    }
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
