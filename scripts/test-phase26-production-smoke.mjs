/**
 * Phase 26 — Production smoke tests (GET-only + unauth checks).
 * Does NOT send notifications to production users.
 * Does NOT modify production data.
 */
import fs from "fs";
import path from "path";

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

const prodText = fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8");
const PB = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const BASE = "https://serba.space";
const ADMIN_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const ADMIN_PASS = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

const results = [];
let passed = 0, failed = 0;

function rec(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"} ${name} :: ${detail}`);
  if (ok) passed++; else failed++;
}

async function get(url, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  return { status: res.status, json: await res.json().catch(() => ({})), text: await res.text().catch(() => "") };
}

async function post(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

console.log("=== Phase 26 Production Smoke Tests ===");
console.log("BASE:", BASE);
console.log("PB:", PB);
console.log("");

// ── 1. Health ─────────────────────────────────────────────────────────────────
console.log("── 1. Health ──────────────────────────────────────────────────");
const loginRes = await fetch(`${BASE}/login`);
rec("Login page HTTP 200", loginRes.status === 200, `http=${loginRes.status}`);
const loginHtml = await loginRes.text();
rec("No localhost in login page", !loginHtml.includes("127.0.0.1") && !loginHtml.includes("localhost"), "clean");
rec("No staging URL in login page", !loginHtml.includes("staging.serba.space") && !loginHtml.includes("pb-staging"), "clean");

const pbH = await fetch(`${PB}/api/health`);
rec("PocketBase health", pbH.status === 200, `http=${pbH.status}`);

// Static assets
const staticRes = await fetch(`${BASE}/systemLogoWide.png?v=5`, { method: "HEAD" });
rec("Static assets", [200, 304].includes(staticRes.status), `http=${staticRes.status}`);

// ── 2. Unauthenticated API → 401 ──────────────────────────────────────────────
console.log("\n── 2. Unauthenticated → 401 ───────────────────────────────────");
const unauthEndpoints = [
  "/api/notifications",
  "/api/hr/reports",
  "/api/hr/findings",
  "/api/hr/rating/periods",
  "/api/hr/attendance/today",
  "/api/hr/leave",
];
for (const ep of unauthEndpoints) {
  const method = ep === "/api/hr/leave" ? "POST" : "GET";
  const r = method === "GET"
    ? await get(`${BASE}${ep}`)
    : await post(`${BASE}${ep}`, { leave_type: "annual", start_date: "2026-12-01", end_date: "2026-12-01" });
  rec(`${method} ${ep} (no auth)`, r.status === 401 || r.status === 403 || (method === "POST" && r.status === 401), `http=${r.status}`);
}

const pushUnauth = await post(`${BASE}/api/push-tokens`, { token: "ExponentPushToken[test]", platform: "android" });
rec("POST /api/push-tokens (no auth)", pushUnauth.status === 401, `http=${pushUnauth.status}`);

// ── 3. Notification API exists (post-deploy) ───────────────────────────────
console.log("\n── 3. Notification endpoints ──────────────────────────────────");
// After deploy, unauth GET /api/notifications should be 401 (route exists)
const notifUnauth = await get(`${BASE}/api/notifications`);
rec("GET /api/notifications exists (401 unauth)", notifUnauth.status === 401, `http=${notifUnauth.status} (404=route missing)`);

// ── 4. Schema (GET-only via admin) ───────────────────────────────────────────
console.log("\n── 4. Production schema (GET-only) ────────────────────────────");
const adminAuth = await post(`${PB}/api/admins/auth-with-password`, { identity: ADMIN_EMAIL, password: ADMIN_PASS });
rec("Admin auth", adminAuth.status === 200 && !!adminAuth.json.token, `http=${adminAuth.status}`);
const adminToken = adminAuth.json.token;

if (adminToken) {
  for (const col of ["notifications", "push_tokens"]) {
    const r = await get(`${PB}/api/collections/${col}`, adminToken);
    rec(`Collection ${col} EXISTS`, r.status === 200, `http=${r.status}`);
  }

  // Data counts
  console.log("\n── 5. Data integrity ──────────────────────────────────────────");
  const countCols = ["users", "profiles", "leave_requests", "notifications", "push_tokens"];
  const counts = {};
  for (const col of countCols) {
    const r = await get(`${PB}/api/collections/${col}/records?page=1&perPage=1`, adminToken);
    counts[col] = r.json.totalItems ?? null;
    const expected = { users: 23, profiles: 23, leave_requests: 34 };
    const ok = col in expected ? counts[col] === expected[col] : counts[col] === 0 || counts[col] === null;
    rec(`${col} count = ${counts[col]}`, ok, col in expected ? `expected ${expected[col]}` : "expected 0");
  }

  // Rules unchanged on existing collections
  console.log("\n── 6. Existing rules unchanged ────────────────────────────────");
  const usersCol = await get(`${PB}/api/collections/users`, adminToken);
  const leaveCol = await get(`${PB}/api/collections/leave_requests`, adminToken);
  rec("users collection readable", usersCol.status === 200, "");
  rec("leave_requests collection readable", leaveCol.status === 200, "");
  rec("leave_requests createRule = null", leaveCol.json?.createRule === null, `createRule=${leaveCol.json?.createRule}`);
}

// ── 7. Staging untouched ─────────────────────────────────────────────────────
console.log("\n── 7. Staging safety ────────────────────────────────────────────");
const stagingH = await fetch("https://staging.serba.space/login");
rec("Staging still responding", stagingH.status === 200, `http=${stagingH.status}`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════════════════");
console.log(`Production Smoke: PASS=${passed} FAIL=${failed} TOTAL=${passed + failed}`);
if (failed > 0) {
  console.log("\nFAILED:");
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name} :: ${r.detail}`));
}
console.log("══════════════════════════════════════════════════════════════════");
console.log("\nNote: Authenticated RBAC/feature/notification event tests require Owner physical UAT.");
console.log("Physical Android push: PENDING PHYSICAL ANDROID UAT (Phase 27)");
process.exit(failed > 0 ? 1 : 0);
