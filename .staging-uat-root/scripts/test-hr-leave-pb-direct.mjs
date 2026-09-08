/**
 * Staging-gated direct PocketBase leave security tests.
 *
 * Manual only — never auto-run in CI against production.
 *
 *   npm run test:hr-leave-pb-direct
 *
 * Required:
 *   POCKETBASE_STAGING_URL
 *   STAGING_SEED_PASSWORD
 *
 * Optional:
 *   STAGING_EXPECT_MODE=baseline|locked   (default: baseline)
 *   STAGING_EMAIL_DOMAIN=staging.serba.test
 *
 * baseline  ≈ current open rules (pre write-lock; matches production snapshot shape)
 * locked    = after create/update/delete = null (Wave 2B target)
 */

import {
  assertStagingOnly,
  loadStagingEnv,
  printStagingUsage,
  requireStagingSeedPassword,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const STAGING_URL = String(env.POCKETBASE_STAGING_URL || "").trim().replace(/\/$/, "");
const EMAIL_DOMAIN = (env.STAGING_EMAIL_DOMAIN || "staging.serba.test").trim();
const LEAVE_COLLECTION = "leave_requests";
const MODE = String(env.STAGING_EXPECT_MODE || "baseline").trim().toLowerCase();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printStagingUsage("test-hr-leave-pb-direct");
  process.exit(0);
}

const { url: TARGET } = assertStagingOnly(env, STAGING_URL);
const SEED_PASSWORD = requireStagingSeedPassword(env);

/** @type {Record<string, "deny"|"allow"|"skip">} */
const BASELINE_EXPECT = {
  // PocketBase often returns HTTP 200 + empty items when listRule denies (matches prod gate).
  unauthenticated_list: "allow",
  unauthenticated_view: "deny",
  staff_read_own: "allow",
  staff_read_another: "deny",
  // Pre-lock (prod-like): staff may create own leave; status=approved not blocked by createRule text
  staff_create: "allow",
  staff_create_approved: "allow",
  staff_update_status_approved: "allow",
  staff_update_status_rejected: "allow",
  staff_forge_hr_action: "allow",
  staff_update_another: "deny",
  staff_delete: "deny",
  hr_direct_privileged_update: "allow",
  owner_direct_privileged_update: "allow",
};

/** After write-lock: all authenticated direct writes denied (API-only mutations). */
const LOCKED_EXPECT = {
  // Same PB empty-list quirk may still return 200; keep configurable via EXPECT_UNAUTH_LIST
  unauthenticated_list: "allow",
  unauthenticated_view: "deny",
  staff_read_own: "allow",
  staff_read_another: "deny",
  staff_create: "deny",
  staff_create_approved: "deny",
  staff_update_status_approved: "deny",
  staff_update_status_rejected: "deny",
  staff_forge_hr_action: "deny",
  staff_update_another: "deny",
  staff_delete: "deny",
  hr_direct_privileged_update: "deny",
  owner_direct_privileged_update: "deny",
};

const defaults = MODE === "locked" ? LOCKED_EXPECT : BASELINE_EXPECT;

function envExpect(key, fallback) {
  const v = String(env[key] || "").trim().toLowerCase();
  if (v === "deny" || v === "allow" || v === "skip") return v;
  return fallback;
}

const EXPECT = {
  unauthenticated_list: envExpect("EXPECT_UNAUTH_LIST", defaults.unauthenticated_list),
  unauthenticated_view: envExpect("EXPECT_UNAUTH_VIEW", defaults.unauthenticated_view),
  staff_read_own: envExpect("EXPECT_STAFF_READ_OWN", defaults.staff_read_own),
  staff_read_another: envExpect("EXPECT_STAFF_READ_ANOTHER", defaults.staff_read_another),
  staff_create: envExpect("EXPECT_STAFF_CREATE", defaults.staff_create),
  staff_create_approved: envExpect("EXPECT_STAFF_CREATE_APPROVED", defaults.staff_create_approved),
  staff_update_status_approved: envExpect("EXPECT_STAFF_UPDATE_APPROVED", defaults.staff_update_status_approved),
  staff_update_status_rejected: envExpect("EXPECT_STAFF_UPDATE_REJECTED", defaults.staff_update_status_rejected),
  staff_forge_hr_action: envExpect("EXPECT_STAFF_FORGE_HR", defaults.staff_forge_hr_action),
  staff_update_another: envExpect("EXPECT_STAFF_UPDATE_ANOTHER", defaults.staff_update_another),
  staff_delete: envExpect("EXPECT_STAFF_DELETE", defaults.staff_delete),
  hr_direct_privileged_update: envExpect("EXPECT_HR_DIRECT", defaults.hr_direct_privileged_update),
  owner_direct_privileged_update: envExpect("EXPECT_OWNER_DIRECT", defaults.owner_direct_privileged_update),
};

function emailFor(slug) {
  return `staging-leave-${slug}@${EMAIL_DOMAIN}`;
}

async function authUser(email, password) {
  const res = await fetch(`${TARGET}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.token) {
    throw new Error(`Auth failed for ${email}: HTTP ${res.status}`);
  }
  return { token: data.token, record: data.record };
}

async function pbFetch(pathSuffix, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(`${TARGET}${pathSuffix}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function outcomeAllowed(res) {
  return res.ok === true && res.status >= 200 && res.status < 300;
}

function check(name, expect, actualAllowed) {
  if (expect === "skip") {
    return { name, expect, result: "SKIP", pass: true };
  }
  const wanted = expect === "allow";
  const pass = actualAllowed === wanted;
  return {
    name,
    expect,
    actual: actualAllowed ? "allow" : "deny",
    result: pass ? "PASS" : "FAIL",
    pass,
  };
}

console.log("=== [STAGING] Direct PB leave security tests ===");
console.log(`Target: ${TARGET}`);
console.log(`Mode: ${MODE} (set STAGING_EXPECT_MODE=locked after write-lock)`);
console.log("Direct PocketBase only — production not targeted.");

const results = [];

{
  const list = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records?perPage=1`);
  results.push(check("unauthenticated list", EXPECT.unauthenticated_list, outcomeAllowed(list)));
  const view = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/nonexistentid000`);
  results.push(check("unauthenticated view", EXPECT.unauthenticated_view, outcomeAllowed(view)));
}

let staffA1;
let staffA2;
let hrA;
let owner;
try {
  staffA1 = await authUser(emailFor("staff-a1"), SEED_PASSWORD);
  staffA2 = await authUser(emailFor("staff-a2"), SEED_PASSWORD);
  hrA = await authUser(emailFor("hr-a"), SEED_PASSWORD);
  owner = await authUser(emailFor("owner"), SEED_PASSWORD);
} catch (e) {
  console.error("Fixture auth failed — run: npm run seed:hr-leave-staging");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const staffA1Id = staffA1.record.id;
const staffA2Id = staffA2.record.id;

async function listLeaves(token, filter) {
  const q = filter
    ? `?perPage=5&filter=${encodeURIComponent(filter)}`
    : `?perPage=5`;
  return pbFetch(`/api/collections/${LEAVE_COLLECTION}/records${q}`, { token });
}

{
  const own = await listLeaves(staffA1.token, `user = "${staffA1Id}"`);
  results.push(check("staff read own leave", EXPECT.staff_read_own, outcomeAllowed(own)));
}

{
  const other = await listLeaves(staffA1.token, `user = "${staffA2Id}"`);
  const items = other.data?.items ?? [];
  const sawOther = outcomeAllowed(other) && items.some((r) => String(r.user) === String(staffA2Id));
  results.push(check("staff read another leave", EXPECT.staff_read_another, sawOther));
}

const start = new Date();
start.setDate(start.getDate() + 21);
const ymd = start.toISOString().slice(0, 10);

// Staging leave_requests fields (verified): user, date, devision, status, note, hr_action_*
const createPendingBody = {
  user: staffA1Id,
  date: ymd,
  status: "pending",
  devision: "STAGING-DIV",
  note: "[STAGING] direct PB create pending",
};

{
  const created = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records`, {
    token: staffA1.token,
    method: "POST",
    body: createPendingBody,
  });
  results.push(check("staff create leave", EXPECT.staff_create, outcomeAllowed(created)));
}

{
  const created = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records`, {
    token: staffA1.token,
    method: "POST",
    body: {
      ...createPendingBody,
      status: "approved",
      note: "[STAGING] direct create approved",
    },
  });
  results.push(check("staff create approved leave", EXPECT.staff_create_approved, outcomeAllowed(created)));
}

let ownLeaveId = null;
{
  const own = await listLeaves(staffA1.token, `user = "${staffA1Id}"`);
  ownLeaveId = own.data?.items?.[0]?.id ?? null;
}

if (!ownLeaveId) {
  results.push({
    name: "staff update tests",
    expect: "n/a",
    result: "SKIP",
    pass: true,
    note: "No leave row for Staff-A1 — re-run seed with STAGING_SEED_LEAVE_SAMPLES=1",
  });
} else {
  {
    const patch = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${ownLeaveId}`, {
      token: staffA1.token,
      method: "PATCH",
      body: { status: "approved" },
    });
    results.push(
      check("staff update own status=approved", EXPECT.staff_update_status_approved, outcomeAllowed(patch)),
    );
  }
  {
    const patch = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${ownLeaveId}`, {
      token: staffA1.token,
      method: "PATCH",
      body: { status: "rejected" },
    });
    results.push(
      check("staff update own status=rejected", EXPECT.staff_update_status_rejected, outcomeAllowed(patch)),
    );
  }
  {
    const patch = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${ownLeaveId}`, {
      token: staffA1.token,
      method: "PATCH",
      body: {
        hr_action_by: staffA1Id,
        hr_action_name: "FORGED",
        hr_action_at: new Date().toISOString(),
      },
    });
    results.push(check("staff forge hr_action_by/name/at", EXPECT.staff_forge_hr_action, outcomeAllowed(patch)));
  }
  {
    const del = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${ownLeaveId}`, {
      token: staffA1.token,
      method: "DELETE",
    });
    results.push(check("staff delete leave", EXPECT.staff_delete, outcomeAllowed(del)));
  }
}

{
  const otherList = await listLeaves(staffA2.token, `user = "${staffA2Id}"`);
  const otherId = otherList.data?.items?.[0]?.id;
  if (!otherId) {
    results.push({
      name: "staff update another user's leave",
      expect: EXPECT.staff_update_another,
      result: "SKIP",
      pass: true,
      note: "No Staff-A2 leave row",
    });
  } else {
    const patch = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${otherId}`, {
      token: staffA1.token,
      method: "PATCH",
      body: { status: "approved" },
    });
    results.push(check("staff update another user's leave", EXPECT.staff_update_another, outcomeAllowed(patch)));
  }
}

async function privilegedUpdate(label, token, expectKey) {
  const targetList = await listLeaves(token, `user = "${staffA1Id}"`);
  const targetId = targetList.data?.items?.[0]?.id ?? ownLeaveId;
  if (!targetId) {
    results.push({
      name: label,
      expect: EXPECT[expectKey],
      result: "SKIP",
      pass: true,
      note: "no target leave id",
    });
    return;
  }
  const patch = await pbFetch(`/api/collections/${LEAVE_COLLECTION}/records/${targetId}`, {
    token,
    method: "PATCH",
    body: { status: "approved", hr_action_name: `[STAGING] ${label}` },
  });
  results.push(check(label, EXPECT[expectKey], outcomeAllowed(patch)));
}

await privilegedUpdate("HR direct privileged update", hrA.token, "hr_direct_privileged_update");
await privilegedUpdate("Owner direct privileged update", owner.token, "owner_direct_privileged_update");

console.log("\nResults:");
let failed = 0;
for (const r of results) {
  console.log(
    `${r.result.padEnd(4)} ${r.name} (expect=${r.expect}${r.actual ? `, actual=${r.actual}` : ""})${r.note ? " — " + r.note : ""}`,
  );
  if (!r.pass) failed++;
}

console.log(failed ? `\n${failed} FAIL(s)` : "\nAll checks matched expectations");
console.log("Production was not targeted.");
process.exit(failed ? 1 : 0);
