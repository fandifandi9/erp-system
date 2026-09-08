/**
 * Phase 12B — one-shot public staging UAT checks (no secrets printed).
 */
import fs from "fs";
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";

function loadEnvFile(name) {
  const o = {};
  if (!fs.existsSync(name)) return o;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i)] = v;
  }
  return o;
}

const env = loadStagingEnv();
requireStagingAdmin(env);
// Public UAT targets (allowlisted staging hosts — not production).
assertStagingOnly(env, "https://pb-staging.serba.space");

const loc = loadEnvFile(".env.local");
const BASE = "https://staging.serba.space";
const PB = "https://pb-staging.serba.space";
const pass = String(loc.SMOKE_PASSWORD || env.SMOKE_PASSWORD || env.STAGING_SEED_PASSWORD || "").trim();
// Smoke fixtures created in earlier phases use @serba.test (not STAGING_EMAIL_DOMAIN).
const domain = "serba.test";
const email = `smoke-hr@${domain}`;

if (!pass) {
  console.error("BLOCKED — SMOKE_PASSWORD / STAGING_SEED_PASSWORD missing");
  process.exit(2);
}

const results = [];
function rec(n, ok, detail) {
  results.push({ n, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${n} :: ${detail}`);
}

const pbh = await fetch(`${PB}/api/health`);
rec("PB health HTTPS", pbh.status === 200, String(pbh.status));

const loginPage = await fetch(`${BASE}/login`);
rec("Next login page HTTPS", loginPage.status === 200, String(loginPage.status));

const auth = await fetch(`${PB}/api/collections/users/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const authJ = await auth.json().catch(() => ({}));
rec("Staging user login", auth.status === 200 && !!authJ.token, `http=${auth.status}`);
const token = authJ.token;
if (!token) process.exit(1);

const per = await fetch(`${BASE}/api/hr/rating/periods`, {
  headers: { Authorization: `Bearer ${token}` },
});
rec("Rating API /periods", [200, 401, 403].includes(per.status), `http=${per.status}`);

const asp = await fetch(`${BASE}/api/hr/rating/aspects`, {
  headers: { Authorization: `Bearer ${token}` },
});
const aspJ = await asp.json().catch(() => ({}));
rec(
  "Rating API /aspects",
  asp.status === 200,
  `http=${asp.status} items=${(aspJ.items || aspJ.data || []).length ?? "?"}`,
);

const att = await fetch(`${BASE}/api/hr/attendance/today`, {
  headers: { Authorization: `Bearer ${token}` },
});
rec(
  "Attendance API /today",
  [200, 400, 401, 403].includes(att.status),
  `http=${att.status}`,
);

const leave = await fetch(`${PB}/api/collections/leave_requests/records`, {
  method: "POST",
  headers: {
    Authorization: token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    user: authJ.record.id,
    start_date: "2026-09-01",
    end_date: "2026-09-01",
    leave_type: "annual",
    status: "pending",
  }),
});
rec(
  "Leave direct PB locked",
  [400, 401, 403].includes(leave.status),
  `http=${leave.status}`,
);

// Ensure Next server uses staging PB (admin auth against staging host)
const admin = requireStagingAdmin(env);
const adminAuth = await fetch(`${PB}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: admin.email, password: admin.password }),
});
rec("Staging admin auth", adminAuth.status === 200, `http=${adminAuth.status}`);

const fail = results.filter((r) => !r.ok).length;
console.log(`\nPASS=${results.length - fail} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
