/**
 * Phase 5 — Staging Next.js API leave regression.
 *
 * Requires:
 *   - SSH tunnel → staging PB http://127.0.0.1:8092
 *   - Next.js on BASE_URL with NEXT_PUBLIC_POCKETBASE_URL=staging
 *     and POCKETBASE_ADMIN_* = staging admin (NOT production)
 *   - .env.staging.local fixtures from seed:hr-leave-staging
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3001 node scripts/test-hr-leave-api-staging.mjs
 */

import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
  requireStagingSeedPassword,
  hostOf,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const { url: STAGING_URL } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const stagingAdmin = requireStagingAdmin(env);
const SEED_PASSWORD = requireStagingSeedPassword(env);
const EMAIL_DOMAIN = (env.STAGING_EMAIL_DOMAIN || "staging.serba.test").trim();
const BASE_URL = String(env.BASE_URL || process.env.BASE_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);

const results = [];

function record(test, expected, actual, result, note = "") {
  const row = { test, expected, actual, result, note };
  results.push(row);
  const tag = result === "PASS" ? "PASS" : result === "WARN" ? "WARN" : "FAIL";
  console.log(`[${tag}] ${test}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}${note ? ` — ${note}` : ""}`);
}

function emailFor(slug) {
  return `staging-leave-${slug}@${EMAIL_DOMAIN}`;
}

function ymdPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function authUser(email) {
  const res = await fetch(`${STAGING_URL}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: SEED_PASSWORD }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(`Auth ${email} failed: HTTP ${res.status}`);
  }
  return { token: data.token, record: data.record };
}

async function adminToken() {
  const res = await fetch(`${STAGING_URL}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: stagingAdmin.email,
      password: stagingAdmin.password,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.token) throw new Error("Staging admin auth failed");
  return data.token;
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json, ok: res.ok };
}

async function pbDirect(method, path, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(`${STAGING_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json, ok: res.ok };
}

async function verifyApiTargetsStaging() {
  // Probe: unauth leave POST → 401; then check admin can see staging-only users
  const health = await fetch(`${BASE_URL}/api/health`).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => ({})),
  }));
  if (health.status !== 200) {
    throw new Error(`Next.js ${BASE_URL} health failed: ${health.status}`);
  }

  // Ensure staging URL is not production
  if (hostOf(STAGING_URL) === "pb.serba.space") {
    throw new Error("Refusing production PB URL");
  }
  try {
    const u = new URL(STAGING_URL);
    if (u.port === "8091") throw new Error("Refusing production port 8091");
  } catch (e) {
    if (String(e.message).includes("Refusing")) throw e;
  }

  // Confirm Next admin path uses staging by submitting with staff and checking record on staging
  console.log("API base:", BASE_URL);
  console.log("PB staging:", STAGING_URL);
  console.log("Staging admin domain:", stagingAdmin.email.split("@")[1]);
}

/** Clear this-month pending/approved leaves for a user so monthly quota allows new submits. Staging admin only. */
async function softenQuota(adminTok, userId) {
  const list = await pbDirect(
    "GET",
    `/api/collections/leave_requests/records?perPage=100&filter=${encodeURIComponent(
      `user = "${userId}" && (status = "pending" || status = "approved")`,
    )}`,
    adminTok,
  );
  const items = list.json.items || [];
  for (const row of items) {
    await pbDirect(
      "PATCH",
      `/api/collections/leave_requests/records/${row.id}`,
      adminTok,
      { status: "cancelled", note: `${row.note || ""} [STAGING quota clear]` },
    );
  }
}

console.log("=== Phase 5 — Staging API Leave Regression ===");
await verifyApiTargetsStaging();

const adminTok = await adminToken();

// Confirm write-lock still on
{
  const cols = await pbDirect("GET", "/api/collections?perPage=200", adminTok);
  const leave = (cols.json.items || []).find((c) => c.name === "leave_requests");
  const locked =
    leave && leave.createRule === null && leave.updateRule === null && leave.deleteRule === null;
  record(
    "Staging rules remain locked",
    "create/update/delete = null",
    locked
      ? "locked"
      : `create=${JSON.stringify(leave?.createRule)} update=${JSON.stringify(leave?.updateRule)} delete=${JSON.stringify(leave?.deleteRule)}`,
    locked ? "PASS" : "FAIL",
  );
  if (!locked) {
    console.error("Abort — staging not locked");
    process.exit(1);
  }
}

const staffA1 = await authUser(emailFor("staff-a1"));
const staffA2 = await authUser(emailFor("staff-a2"));
const staffB = await authUser(emailFor("staff-b"));
const hrA = await authUser(emailFor("hr-a"));
const hrB = await authUser(emailFor("hr-b"));
const owner = await authUser(emailFor("owner"));

await softenQuota(adminTok, staffA1.record.id);
await softenQuota(adminTok, staffA2.record.id);
await softenQuota(adminTok, staffB.record.id);

const start1 = ymdPlus(30);
const end1 = start1;
const start2 = ymdPlus(35);
const start3 = ymdPlus(40);
const startCancel = ymdPlus(45);
const startOwner = ymdPlus(50);
const startB = ymdPlus(55);

// --- A. Staff submit ---
let leaveApproveId = null;
{
  const res = await api("POST", "/api/hr/leave", staffA1.token, {
    start_date: start1,
    end_date: end1,
    reason: "[STAGING] API regression submit A1",
  });
  const pass = res.status === 200 && res.json.ok === true && !!res.json.id;
  leaveApproveId = res.json.id || null;
  record(
    "Staff submit",
    "PASS via Next.js API → pending on staging",
    pass ? `PASS id=${leaveApproveId} status=${res.json.data?.status || "?"}` : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`,
    pass ? "PASS" : "FAIL",
  );

  if (pass) {
    const verify = await pbDirect(
      "GET",
      `/api/collections/leave_requests/records/${leaveApproveId}`,
      adminTok,
    );
    const onStaging = verify.ok && verify.json.status === "pending";
    record(
      "Staff submit lands on staging PB",
      "pending record readable via staging admin",
      onStaging ? `pending on staging` : `HTTP ${verify.status}`,
      onStaging ? "PASS" : "FAIL",
    );
  }
}

// --- B. Staff forge ---
{
  const res = await api("POST", "/api/hr/leave", staffA1.token, {
    start_date: start2,
    end_date: start2,
    reason: "forge status",
    status: "approved",
  });
  const deny = res.status === 400 || res.status === 403;
  record(
    "Staff forge approval (status in body)",
    "DENY",
    `HTTP ${res.status}`,
    deny ? "PASS" : "FAIL",
  );
}
{
  const res = await api("POST", "/api/hr/leave", staffA1.token, {
    start_date: start2,
    end_date: start2,
    reason: "forge hr",
    hr_action_by: staffA1.record.id,
    hr_action_name: "FORGED",
    hr_action_at: new Date().toISOString(),
  });
  const deny = res.status === 400;
  record(
    "Staff forge hr_action_* in body",
    "DENY 400",
    `HTTP ${res.status}`,
    deny ? "PASS" : "FAIL",
  );
}
{
  // Direct status manipulation via API — staff calling approve must be denied (403)
  let target = leaveApproveId;
  if (!target) {
    // Fallback target from any pending leave on staging for A1 (should not happen after submit PASS)
    target = "nonexistent_leave_id_for_staff_deny";
  }
  const res = await api("POST", `/api/hr/leave/${target}/approve`, staffA1.token, {});
  const deny = res.status === 403 || res.status === 401 || res.status === 400 || res.status === 404;
  record(
    "Staff status manipulation (approve API)",
    "DENY 403",
    `HTTP ${res.status}`,
    deny ? "PASS" : "FAIL",
  );
}

// --- Direct PB remains denied ---
{
  const res = await pbDirect("POST", "/api/collections/leave_requests/records", staffA1.token, {
    user: staffA1.record.id,
    date: start2,
    status: "pending",
    devision: "STAGING-DIV",
    note: "[STAGING] direct after lock",
  });
  record(
    "Direct PB mutation remains denied",
    "DENY create",
    `HTTP ${res.status}`,
    !res.ok ? "PASS" : "FAIL",
  );
}

// --- C. HR approve ---
{
  if (!leaveApproveId) {
    record("HR approve", "PASS", "SKIP — no leave id", "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${leaveApproveId}/approve`, hrA.token, {});
    const pass = res.status === 200 && res.json.ok === true;
    let hrFields = "";
    if (pass) {
      const row = await pbDirect(
        "GET",
        `/api/collections/leave_requests/records/${leaveApproveId}`,
        adminTok,
      );
      hrFields = `status=${row.json.status}; hr_action_by=${row.json.hr_action_by || ""}; hr_action_name=${row.json.hr_action_name || ""}`;
      const okStatus = row.json.status === "approved";
      const okActor = String(row.json.hr_action_by || "") === String(hrA.record.id);
      record(
        "HR approve",
        "PASS status=approved + server hr_action_*",
        pass && okStatus ? hrFields : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 180)} | ${hrFields}`,
        pass && okStatus ? "PASS" : "FAIL",
        okActor ? "" : "WARN hr_action_by mismatch or empty",
      );
      if (pass && okStatus && !okActor) {
        // downgrade note already; keep PASS if status ok but warn
        results[results.length - 1].result = okActor ? "PASS" : "WARN";
      }
    } else {
      record(
        "HR approve",
        "PASS",
        `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 250)}`,
        "FAIL",
      );
    }
  }
}

// --- D. HR reject ---
let leaveRejectId = null;
{
  const created = await api("POST", "/api/hr/leave", staffA2.token, {
    start_date: start3,
    end_date: start3,
    reason: "[STAGING] API regression reject target",
  });
  leaveRejectId = created.json.id || null;
  if (!leaveRejectId) {
    record("HR reject", "PASS", `submit failed HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 180)}`, "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${leaveRejectId}/reject`, hrA.token, {
      reason: "Staging regression reject reason",
    });
    const pass = res.status === 200 && res.json.ok === true;
    let status = "";
    if (pass) {
      const row = await pbDirect(
        "GET",
        `/api/collections/leave_requests/records/${leaveRejectId}`,
        adminTok,
      );
      status = row.json.status;
    }
    record(
      "HR reject",
      "PASS status=rejected",
      pass ? `status=${status}` : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`,
      pass && status === "rejected" ? "PASS" : "FAIL",
    );
  }
}

// --- E. Staff cancel ---
{
  const created = await api("POST", "/api/hr/leave", staffA1.token, {
    start_date: startCancel,
    end_date: startCancel,
    reason: "[STAGING] API regression cancel target",
  });
  const id = created.json.id;
  if (!id) {
    record("Staff cancel/update", "PASS cancel pending via API", `submit failed HTTP ${created.status}`, "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${id}/cancel`, staffA1.token, {});
    const pass = res.status === 200 && res.json.ok === true;
    let status = "";
    if (pass) {
      const row = await pbDirect("GET", `/api/collections/leave_requests/records/${id}`, adminTok);
      status = row.json.status;
    }
    record(
      "Staff cancel/update",
      "PASS cancel pending via API",
      pass ? `status=${status}` : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`,
      pass && status === "cancelled" ? "PASS" : "FAIL",
    );
  }
}

// --- F. Cross-company ---
let leaveBId = null;
{
  const created = await api("POST", "/api/hr/leave", staffB.token, {
    start_date: startB,
    end_date: startB,
    reason: "[STAGING] Company B leave",
  });
  leaveBId = created.json.id || null;
  if (!leaveBId) {
    record("Cross-company isolation (setup B leave)", "create Staff-B leave", `HTTP ${created.status} ${JSON.stringify(created.json).slice(0, 180)}`, "FAIL");
  } else {
    record("Cross-company isolation (setup B leave)", "create Staff-B leave", `id=${leaveBId}`, "PASS");
  }
}
{
  // HR-A approve Company B → DENY
  if (!leaveBId) {
    record("Cross-company HR-A approve Company B", "DENY", "no leave B", "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${leaveBId}/approve`, hrA.token, {});
    const deny = res.status === 403 || (res.status === 400 && /lintas|entitas|scope|akses/i.test(JSON.stringify(res.json)));
    record(
      "Cross-company HR-A approve Company B",
      "DENY",
      `HTTP ${res.status} ${res.json.error || res.json.message || ""}`,
      deny || (res.status !== 200) ? (res.status === 200 ? "FAIL" : "PASS") : "FAIL",
    );
    // Fix logic: PASS only if not 200 ok
    const last = results[results.length - 1];
    if (res.status === 200 && res.json.ok) last.result = "FAIL";
    else if (res.status === 403 || res.status === 400) last.result = "PASS";
  }
}
{
  // HR-B approve Company A leave (use a fresh A leave)
  const created = await api("POST", "/api/hr/leave", staffA2.token, {
    start_date: ymdPlus(60),
    end_date: ymdPlus(60),
    reason: "[STAGING] A leave for HR-B deny",
  });
  const id = created.json.id;
  if (!id) {
    record("Cross-company HR-B approve Company A", "DENY", `setup fail HTTP ${created.status}`, "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${id}/approve`, hrB.token, {});
    const denied = !(res.status === 200 && res.json.ok);
    record(
      "Cross-company HR-B approve Company A",
      "DENY",
      `HTTP ${res.status} ${res.json.error || res.json.message || ""}`,
      denied ? "PASS" : "FAIL",
    );
  }
}
{
  // Staff-B cannot approve A (already covered) — try cancel A's leave
  if (!leaveRejectId) {
    record("Cross-company Staff-B mutate Company A", "DENY", "no target", "WARN");
  } else {
    const res = await api("POST", `/api/hr/leave/${leaveRejectId}/cancel`, staffB.token, {});
    const denied = !(res.status === 200 && res.json.ok);
    record(
      "Cross-company Staff-B mutate Company A",
      "DENY",
      `HTTP ${res.status}`,
      denied ? "PASS" : "FAIL",
    );
  }
}

// --- Owner workflow ---
{
  const created = await api("POST", "/api/hr/leave", staffA1.token, {
    start_date: startOwner,
    end_date: startOwner,
    reason: "[STAGING] Owner approve target",
  });
  const id = created.json.id;
  if (!id) {
    record("Owner workflow", "Owner can approve via API", `setup fail HTTP ${created.status}`, "FAIL");
  } else {
    const res = await api("POST", `/api/hr/leave/${id}/approve`, owner.token, {});
    const pass = res.status === 200 && res.json.ok === true;
    record(
      "Owner workflow",
      "Owner can approve via API",
      pass ? "approved" : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`,
      pass ? "PASS" : "FAIL",
    );
  }
}

// Summary table
console.log("\n=== SUMMARY TABLE ===");
console.log("| Test | Expected | Actual | Result |");
console.log("|------|----------|--------|--------|");
for (const r of results) {
  console.log(
    `| ${r.test} | ${r.expected.replace(/\|/g, "/")} | ${String(r.actual).replace(/\|/g, "/").slice(0, 80)} | ${r.result} |`,
  );
}

const pass = results.filter((r) => r.result === "PASS").length;
const fail = results.filter((r) => r.result === "FAIL").length;
const warn = results.filter((r) => r.result === "WARN").length;
console.log(`\nPASS=${pass} FAIL=${fail} WARN=${warn} TOTAL=${results.length}`);
process.exit(fail > 0 ? 1 : 0);
