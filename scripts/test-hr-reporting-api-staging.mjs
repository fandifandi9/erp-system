/**
 * Phase 13 — Staging API tests for Reports/Findings + attachment auth.
 * Staging only. Production untouched.
 *
 *   npm run pb:hr-reporting-schema:staging
 *   $env:BASE_URL='https://staging.serba.space'
 *   npm run test:hr-reporting-api-staging
 */
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";
import { stagingJson } from "./lib/staging-http.mjs";

const env = loadStagingEnv();
const { url: STAGING_URL } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const stagingAdmin = requireStagingAdmin(env);
const SMOKE_PASSWORD = String(env.SMOKE_PASSWORD || "").trim();
const DOMAIN = String(env.SMOKE_EMAIL_DOMAIN || "serba.test").trim();
const BASE_URL = String(env.BASE_URL || "https://staging.serba.space").replace(/\/$/, "");

if (!SMOKE_PASSWORD) {
  console.error("BLOCKED — SMOKE_PASSWORD required");
  process.exit(2);
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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
  const res = await stagingJson("POST", `${STAGING_URL}/api/collections/users/auth-with-password`, {
    body: { identity: em, password: SMOKE_PASSWORD },
    label: `auth ${em}`,
  });
  if (res.status !== 200 || !res.json.token) {
    throw new Error(`Auth ${em} failed HTTP ${res.status}`);
  }
  return { token: res.json.token, record: res.json.record };
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
  return { status: res.status, json };
}

async function apiForm(path, token, buf, filename, mime) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), filename);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

let empA;
let empB;
let hr;
try {
  empA = await authUser(email("employee"));
  empB = await authUser(email("warehouse"));
  hr = await authUser(email("hr"));
} catch (e) {
  console.error("BLOCKED — smoke auth failed", e.message);
  process.exit(2);
}

{
  const r = await api("GET", "/api/hr/reports", null);
  record("Unauth list reports → 401", "401", String(r.status), r.status === 401 ? "PASS" : "FAIL");
}

const created = await api("POST", "/api/hr/reports", empA.token, {
  title: "Kerusakan fasilitas",
  body: "Lantai gudang retak.",
  category: "facility",
});
record(
  "Employee create report without image",
  "200",
  String(created.status),
  created.status === 200 && created.json.id ? "PASS" : "FAIL",
);
const reportId = created.json.id || created.json.data?.id;

{
  const r = await api("POST", "/api/hr/findings", empA.token, {
    title: "Merokok di gudang",
    body: "Dugaan merokok.",
    category: "safety",
  });
  record("Employee create finding → 403", "403", String(r.status), r.status === 403 ? "PASS" : "FAIL");
}

let attId = "";
if (reportId) {
  const up = await apiForm(`/api/hr/reports/${reportId}/attachments`, empA.token, PNG, "bukti.png", "image/png");
  record("Upload PNG evidence", "200", String(up.status), up.status === 200 ? "PASS" : "FAIL");
  attId = up.json.data?.id || "";

  const bad = await apiForm(
    `/api/hr/reports/${reportId}/attachments`,
    empA.token,
    Buffer.from([0x4d, 0x5a]),
    "x.exe",
    "application/octet-stream",
  );
  record("Invalid file rejected", "400", String(bad.status), bad.status === 400 ? "PASS" : "FAIL");

  for (let i = 0; i < 4; i++) {
    await apiForm(`/api/hr/reports/${reportId}/attachments`, empA.token, PNG, `b${i}.png`, "image/png");
  }
  const sixth = await apiForm(
    `/api/hr/reports/${reportId}/attachments`,
    empA.token,
    PNG,
    "sixth.png",
    "image/png",
  );
  record("Sixth image rejected", "400", String(sixth.status), sixth.status === 400 ? "PASS" : "FAIL");
}

if (reportId) {
  const other = await api("GET", `/api/hr/reports/${reportId}`, empB.token);
  record("Employee B cannot read A's report", "403", String(other.status), other.status === 403 ? "PASS" : "FAIL");
}

if (reportId && attId) {
  const otherFile = await fetch(`${BASE_URL}/api/hr/reports/${reportId}/attachments/${attId}`, {
    headers: { Authorization: `Bearer ${empB.token}` },
  });
  record(
    "Employee B cannot read A's attachment",
    "403",
    String(otherFile.status),
    otherFile.status === 403 ? "PASS" : "FAIL",
  );

  const anon = await fetch(`${BASE_URL}/api/hr/reports/${reportId}/attachments/${attId}`);
  record(
    "Direct Next file URL without auth",
    "401",
    String(anon.status),
    anon.status === 401 ? "PASS" : "FAIL",
  );
}

{
  const finding = await api("POST", "/api/hr/findings", hr.token, {
    title: "Aktivitas merokok di Gudang",
    body: "Dugaan merokok di area gudang.",
    category: "safety",
  });
  record(
    "HR create finding",
    "200",
    String(finding.status),
    finding.status === 200 && finding.json.id ? "PASS" : "FAIL",
  );
}

{
  const r = await stagingJson("GET", `${STAGING_URL}/api/collections/hr_case_attachments/records?perPage=1`, {
    label: "PB attachments unauth",
  });
  record(
    "Direct PB collection without auth",
    "403/401/404",
    String(r.status),
    r.status === 401 || r.status === 403 || r.status === 404 ? "PASS" : "FAIL",
  );
}

const fail = results.filter((x) => x.result === "FAIL").length;
const pass = results.filter((x) => x.result === "PASS").length;
console.log(`\nPASS=${pass} FAIL=${fail}`);
console.log("Production: UNTOUCHED");
process.exit(fail ? 1 : 0);
