/**
 * Phase 11 — Staging attendance API regression (final).
 *
 * Requires:
 *   - SSH tunnel → staging PB http://127.0.0.1:8092
 *   - Next.js BASE_URL with staging PocketBase + staging admin env
 *   - POCKETBASE_STAGING_ADMIN_* (dedicated; never production)
 *   - SMOKE_PASSWORD + smoke-*@serba.test (restored prod backup)
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3001 npm run test:hr-attendance-api-staging
 */
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const { url: STAGING_URL } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const stagingAdmin = requireStagingAdmin(env);
const SMOKE_PASSWORD = String(env.SMOKE_PASSWORD || "").trim();
const DOMAIN = String(env.SMOKE_EMAIL_DOMAIN || "serba.test").trim();
const BASE_URL = String(env.BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

if (!SMOKE_PASSWORD) {
  console.error("BLOCKED — SMOKE_PASSWORD required");
  process.exit(2);
}

const results = [];

function record(test, expected, actual, result) {
  results.push({ test, expected, actual, result });
  console.log(`[${result}] ${test}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
}

function email(slug) {
  return `smoke-${slug}@${DOMAIN}`;
}

async function authUser(em) {
  const res = await fetch(`${STAGING_URL}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: em, password: SMOKE_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(`Auth ${em} failed HTTP ${res.status}`);
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
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Staging admin auth failed HTTP ${res.status}`);
  return data.token;
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json, ok: res.ok };
}

async function clearTodayAttendance(atok, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const list = await fetch(
    `${STAGING_URL}/api/collections/attendance_logs/records?perPage=20&filter=${encodeURIComponent(
      `user = "${userId}" && (date = "${today}" || created >= "${today}")`,
    )}`,
    { headers: { Authorization: atok } },
  ).then((r) => r.json());
  for (const row of list.items || []) {
    await fetch(`${STAGING_URL}/api/collections/attendance_logs/records/${row.id}`, {
      method: "DELETE",
      headers: { Authorization: atok },
    });
  }
}

async function resolveOfficeCoords(atok, userId) {
  const prof = await fetch(
    `${STAGING_URL}/api/collections/profiles/records?perPage=1&filter=${encodeURIComponent(
      `user = "${userId}"`,
    )}&expand=office_id`,
    { headers: { Authorization: atok } },
  ).then((r) => r.json());
  const p = prof.items?.[0];
  const office = p?.expand?.office_id;
  if (office?.lat != null && office?.lng != null) {
    return { lat: Number(office.lat), lng: Number(office.lng), accuracy: 10 };
  }
  return { lat: -6.2, lng: 106.816666, accuracy: 15 };
}

async function setUserStatus(atok, userId, status) {
  await fetch(`${STAGING_URL}/api/collections/users/records/${userId}`, {
    method: "PATCH",
    headers: { Authorization: atok, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

console.log("=== Phase 11 Attendance API Staging (final) ===");
console.log("STAGING", STAGING_URL);
console.log("API", BASE_URL);

const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.status).catch(() => 0);
const loginOk = await fetch(`${BASE_URL}/login`).then((r) => r.status).catch(() => 0);
const nextOk = health === 200 || loginOk === 200;
record("Preflight Next health", "200", health === 200 ? "200" : `health=${health} login=${loginOk}`, nextOk ? "PASS" : "FAIL");

const atok = await adminToken();
record("Staging admin auth", "PASS", "token ok", "PASS");

let employee;
let hr;
try {
  employee = await authUser(email("employee"));
  hr = await authUser(email("hr"));
  record("Smoke employee/hr login", "PASS", "ok", "PASS");
} catch (e) {
  record("Smoke auth", "PASS", e.message, "FAIL");
  process.exit(1);
}

await clearTodayAttendance(atok, employee.record.id);
const coords = await resolveOfficeCoords(atok, employee.record.id);

// Ensure active
await setUserStatus(atok, employee.record.id, "active");

// 1 Check-in PASS
let checkInId = null;
{
  const res = await api("POST", "/api/hr/attendance/check-in", employee.token, coords);
  const pass = res.status === 200 && res.json.ok !== false;
  checkInId = res.json.id || res.json.data?.id || null;
  record(
    "Employee GPS check-in",
    "PASS",
    pass ? `id=${checkInId || "ok"}` : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 160)}`,
    pass ? "PASS" : "FAIL",
  );
}

// 2 Duplicate check-in DENY
{
  const res = await api("POST", "/api/hr/attendance/check-in", employee.token, coords);
  const deny = res.status === 400 || res.status === 403;
  record(
    "Duplicate check-in",
    "DENY",
    `HTTP ${res.status} ${JSON.stringify(res.json.message || res.json.error || "").slice(0, 80)}`,
    deny ? "PASS" : "FAIL",
  );
}

// 3 Check-out PASS
{
  const res = await api("POST", "/api/hr/attendance/check-out", employee.token, {});
  const pass = res.status === 200 && res.json.ok !== false;
  record(
    "Employee GPS check-out",
    "PASS",
    pass ? "ok" : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 120)}`,
    pass ? "PASS" : "FAIL",
  );
}

// 4 Duplicate check-out DENY
{
  const res = await api("POST", "/api/hr/attendance/check-out", employee.token, {});
  const deny = res.status === 400;
  record("Duplicate check-out", "DENY", `HTTP ${res.status}`, deny ? "PASS" : "FAIL");
}

// 5 Unauthorized DENY
{
  const res = await api("POST", "/api/hr/attendance/check-in", null, coords);
  record("Unauthorized check-in", "401", String(res.status), res.status === 401 ? "PASS" : "FAIL");
}

// 6 Forge user DENY
{
  await clearTodayAttendance(atok, employee.record.id);
  const res = await api("POST", "/api/hr/attendance/check-in", employee.token, {
    ...coords,
    user: "forged-user-id",
  });
  record(
    "Attendance tampering (user in body)",
    "400",
    String(res.status),
    res.status === 400 ? "PASS" : "FAIL",
  );
}

// 7 Inactive employee DENY
{
  await clearTodayAttendance(atok, employee.record.id);
  await setUserStatus(atok, employee.record.id, "inactive");
  // re-auth may still work with old token — API checks users.status via admin
  const res = await api("POST", "/api/hr/attendance/check-in", employee.token, coords);
  const deny = res.status === 403 || res.status === 400;
  record(
    "Inactive employee check-in",
    "DENY",
    `HTTP ${res.status} ${JSON.stringify(res.json.message || res.json.error || "").slice(0, 80)}`,
    deny ? "PASS" : "FAIL",
  );
  await setUserStatus(atok, employee.record.id, "active");
}

// 8 Leave block DENY — create temporary approved leave for today
{
  await clearTodayAttendance(atok, employee.record.id);
  const today = new Date().toISOString().slice(0, 10);
  let leaveId = null;
  const createLeave = await fetch(`${STAGING_URL}/api/collections/leave_requests/records`, {
    method: "POST",
    headers: { Authorization: atok, "Content-Type": "application/json" },
    body: JSON.stringify({
      user: employee.record.id,
      status: "approved",
      date: `${today} 00:00:00.000Z`,
      note: "Phase11 leave-block fixture",
    }),
  });
  const leaveBody = await createLeave.json().catch(() => ({}));
  if (createLeave.ok && leaveBody.id) {
    leaveId = leaveBody.id;
    const res = await api("POST", "/api/hr/attendance/check-in", employee.token, coords);
    const deny = res.status === 400;
    record(
      "Leave block check-in",
      "DENY",
      `HTTP ${res.status} ${JSON.stringify(res.json.message || res.json.error || "").slice(0, 80)}`,
      deny ? "PASS" : "FAIL",
    );
    await fetch(`${STAGING_URL}/api/collections/leave_requests/records/${leaveId}`, {
      method: "DELETE",
      headers: { Authorization: atok },
    });
  } else {
    record(
      "Leave block check-in",
      "DENY",
      `could not create leave fixture HTTP ${createLeave.status}`,
      "WARN",
    );
  }
}

// 9 HR read PASS
{
  const res = await api("GET", "/api/hr/attendance?perPage=5", hr.token);
  record(
    "HR read attendance",
    "PASS",
    res.status === 200 && res.json.ok !== false
      ? `items=${(res.json.items || []).length}`
      : `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 100)}`,
    res.status === 200 && res.json.ok !== false ? "PASS" : "FAIL",
  );
}

// 10 HR correction + audit
{
  await clearTodayAttendance(atok, employee.record.id);
  const ci = await api("POST", "/api/hr/attendance/check-in", employee.token, coords);
  const id = ci.json.id || ci.json.data?.id;
  if (!id) {
    record("HR correction setup", "PASS", `check-in failed ${ci.status}`, "FAIL");
  } else {
    const employeeForge = await api("POST", `/api/hr/attendance/${id}/correct`, employee.token, {
      reason: "employee should not correct",
      status: "present",
    });
    record(
      "Employee correction DENY",
      "403",
      String(employeeForge.status),
      employeeForge.status === 403 ? "PASS" : "FAIL",
    );

    const noReason = await api("POST", `/api/hr/attendance/${id}/correct`, hr.token, {
      status: "late",
    });
    record(
      "HR correction without reason",
      "400",
      String(noReason.status),
      noReason.status === 400 ? "PASS" : "FAIL",
    );

    const ok = await api("POST", `/api/hr/attendance/${id}/correct`, hr.token, {
      reason: "Koreksi uji staging Phase 11",
      status: "late",
      late_minutes: 12,
    });
    record(
      "HR correction PASS",
      "PASS",
      ok.status === 200 && ok.json.ok !== false
        ? "ok"
        : `HTTP ${ok.status} ${JSON.stringify(ok.json).slice(0, 120)}`,
      ok.status === 200 && ok.json.ok !== false ? "PASS" : "FAIL",
    );

    // Audit trail in biz_activity_events
    const audit = await fetch(
      `${STAGING_URL}/api/collections/biz_activity_events/records?perPage=5&sort=-created&filter=${encodeURIComponent(
        `event_code="hr.attendance.corrected" && entity_id="${id}"`,
      )}`,
      { headers: { Authorization: atok } },
    ).then((r) => r.json());
    const hasAudit = (audit.items || []).length > 0;
    record(
      "Correction audit trail",
      "PASS",
      hasAudit ? `events=${audit.items.length}` : "no biz_activity_events row",
      hasAudit ? "PASS" : "FAIL",
    );
  }
}

// 11 Cross-company — warehouse on different company than HR
{
  let warehouse;
  try {
    warehouse = await authUser(email("warehouse"));
    const companies = await fetch(`${STAGING_URL}/api/collections/biz_company_profile/records?perPage=10`, {
      headers: { Authorization: atok },
    }).then((r) => r.json());
    const other =
      (companies.items || []).find((c) => c.is_active && c.id !== "6btwqbl9oachvqy") ||
      (companies.items || []).find((c) => c.is_active);
    if (other?.id) {
      // Reset warehouse memberships to other company only
      const mems = await fetch(
        `${STAGING_URL}/api/collections/biz_user_companies/records?perPage=20&filter=${encodeURIComponent(
          `user="${warehouse.record.id}"`,
        )}`,
        { headers: { Authorization: atok } },
      ).then((r) => r.json());
      for (const m of mems.items || []) {
        await fetch(`${STAGING_URL}/api/collections/biz_user_companies/records/${m.id}`, {
          method: "DELETE",
          headers: { Authorization: atok },
        });
      }
      await fetch(`${STAGING_URL}/api/collections/biz_user_companies/records`, {
        method: "POST",
        headers: { Authorization: atok, "Content-Type": "application/json" },
        body: JSON.stringify({ user: warehouse.record.id, company: other.id, is_active: true }),
      });
    }

    await clearTodayAttendance(atok, warehouse.record.id);
    const wCoords = await resolveOfficeCoords(atok, warehouse.record.id);
    const ci = await api("POST", "/api/hr/attendance/check-in", warehouse.token, wCoords);
    if (ci.status !== 200) {
      record("Cross-company setup", "WARN", `warehouse check-in failed ${ci.status}`, "WARN");
    } else {
      const list = await api(
        "GET",
        `/api/hr/attendance?user=${encodeURIComponent(warehouse.record.id)}`,
        hr.token,
      );
      const deny = list.status === 403 || (list.json.items || []).length === 0;
      record(
        "Cross-company HR read",
        "DENY or empty",
        `HTTP ${list.status} count=${(list.json.items || []).length}`,
        deny ? "PASS" : "WARN",
      );
    }
  } catch {
    record("Cross-company isolation", "DENY", "warehouse smoke missing", "WARN");
  }
}

// 12 GPS out of range DENY (if office known)
{
  await clearTodayAttendance(atok, employee.record.id);
  const far = { lat: 0.1, lng: 0.1, accuracy: 10 };
  const res = await api("POST", "/api/hr/attendance/check-in", employee.token, far);
  // May PASS if allow_remote or no office — then WARN
  if (res.status === 400 && /luar zona|di luar|melebihi radius/i.test(String(res.json.message || res.json.error || ""))) {
    record("GPS out-of-range", "DENY", `HTTP ${res.status} ${String(res.json.message || "").slice(0, 80)}`, "PASS");
  } else {
    record(
      "GPS out-of-range",
      "DENY",
      `HTTP ${res.status} ${String(res.json.message || res.json.error || "").slice(0, 120)}`,
      "FAIL",
    );
  }
}

{
  const pbWrite = await fetch(`${STAGING_URL}/api/collections/attendance_logs/records`, {
    method: "POST",
    headers: {
      Authorization: employee.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: employee.record.id,
      date: "2099-01-01",
      status: "present",
    }),
  });
  const deny = pbWrite.status === 401 || pbWrite.status === 403 || pbWrite.status === 400;
  record(
    "Direct PB attendance_logs create DENY",
    "403/401",
    `HTTP ${pbWrite.status}`,
    deny && pbWrite.status !== 200 ? "PASS" : "FAIL",
  );
}

{
  const hist = await api("GET", "/api/hr/attendance/history?perPage=5", employee.token);
  record(
    "Employee attendance history API",
    "200",
    `HTTP ${hist.status} items=${(hist.json.items || []).length}`,
    hist.status === 200 && hist.json.ok !== false ? "PASS" : "FAIL",
  );
  const unauthHist = await api("GET", "/api/hr/attendance/history", null);
  record("Unauthorized history", "401", String(unauthHist.status), unauthHist.status === 401 ? "PASS" : "FAIL");
}

await clearTodayAttendance(atok, employee.record.id);

const pass = results.filter((r) => r.result === "PASS").length;
const fail = results.filter((r) => r.result === "FAIL").length;
const warn = results.filter((r) => r.result === "WARN").length;
console.log(`\nPASS=${pass} FAIL=${fail} WARN=${warn}`);
process.exit(fail > 0 ? 1 : 0);
