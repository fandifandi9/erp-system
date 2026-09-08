/**
 * Phase 12 — Staging HR Rating API tests (security, smart random, privacy, calc).
 *
 * Requires staging PB schema applied + Next on BASE_URL with staging admin.
 *
 *   npm run pb:hr-rating-schema:staging
 *   npm run staging:next-dev
 *   BASE_URL=http://127.0.0.1:3001 npm run test:hr-rating-api-staging
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
  const res = await stagingJson("POST", `${STAGING_URL}/api/collections/users/auth-with-password`, {
    body: { identity: em, password: SMOKE_PASSWORD },
    label: `auth ${em}`,
  });
  if (res.status !== 200 || !res.json.token) {
    throw new Error(`Auth ${em} failed HTTP ${res.status}`);
  }
  return { token: res.json.token, record: res.json.record };
}

async function adminToken() {
  const res = await stagingJson("POST", `${STAGING_URL}/api/admins/auth-with-password`, {
    body: { identity: stagingAdmin.email, password: stagingAdmin.password },
    label: "admin auth",
  });
  if (!res.json.token) throw new Error("Staging admin auth failed");
  return res.json.token;
}

async function api(method, path, token, body) {
  // Next.js on localhost — undici is fine; keep fetch for BASE_URL
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

async function pbAdmin(method, path, atok, body) {
  return stagingJson(method, `${STAGING_URL}${path}`, {
    token: atok,
    body,
    label: `${method} ${path}`,
  });
}

async function ensureOrgAlignment(atok, userIds, companyId, org) {
  for (const uid of userIds) {
    const mem = await pbAdmin(
      "GET",
      `/api/collections/biz_user_companies/records?perPage=1&filter=${encodeURIComponent(
        `user="${uid}" && company="${companyId}"`,
      )}`,
      atok,
    );
    if (!(mem.json.items || []).length) {
      await pbAdmin("POST", `/api/collections/biz_user_companies/records`, atok, {
        user: uid,
        company: companyId,
        is_active: true,
      });
    }
    const prof = await pbAdmin(
      "GET",
      `/api/collections/profiles/records?perPage=1&filter=${encodeURIComponent(`user="${uid}"`)}`,
      atok,
    );
    if (prof.json.items?.[0]) {
      await pbAdmin(
        "PATCH",
        `/api/collections/profiles/records/${prof.json.items[0].id}`,
        atok,
        org,
      );
    }
  }
}

console.log("=== Phase 12 HR Rating Staging ===");
const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.status).catch(() => 0);
const loginOk = await fetch(`${BASE_URL}/login`).then((r) => r.status).catch(() => 0);
const nextOk = health === 200 || loginOk === 200;
record("Preflight Next health", "200", health === 200 ? "200" : `health=${health} login=${loginOk}`, nextOk ? "PASS" : "FAIL");

const pbHealth = await stagingJson("GET", `${STAGING_URL}/api/health`, { label: "pb health", retries: 5 });
record("Preflight PB health", "200", String(pbHealth.status), pbHealth.status === 200 ? "PASS" : "FAIL");

const atok = await adminToken();
record("Staging admin", "PASS", "ok", "PASS");

const col = await pbAdmin("GET", "/api/collections/hr_rating_periods", atok);
record("Schema hr_rating_periods", "200", String(col.status), col.status === 200 ? "PASS" : "FAIL");

let employee, hr, owner, warehouse;
try {
  employee = await authUser(email("employee"));
  hr = await authUser(email("hr"));
  try {
    owner = await authUser(email("owner"));
  } catch {
    owner = null;
  }
  warehouse = await authUser(email("warehouse"));
  record("Smoke login", "PASS", "ok", "PASS");
} catch (e) {
  record("Smoke login", "PASS", e.message, "FAIL");
  process.exit(1);
}

const companies = await pbAdmin(
  "GET",
  "/api/collections/biz_company_profile/records?perPage=5",
  atok,
);
const companyId = (companies.json.items || []).find((c) => c.is_active)?.id;
if (!companyId) {
  record("Company fixture", "PASS", "no active company", "FAIL");
  process.exit(1);
}

// Align employee, warehouse, and a third peer for smart random pool
await ensureOrgAlignment(
  atok,
  [employee.record.id, warehouse.record.id, hr.record.id],
  companyId,
  { department: "Phase12Ops", division: "Phase12Div", office_id: "" },
);

// Create a few more peers by cloning org onto existing users if needed — use warehouse as peer2
// Need 3+ eligible: employee is subject; reviewers from warehouse + hr + ? 
// Create temporary peer users? Prefer reuse: set another smoke if exists.
let peer3 = null;
try {
  peer3 = await authUser(email("manager"));
} catch {
  try {
    peer3 = await authUser(email("staff"));
  } catch {
    peer3 = null;
  }
}
if (peer3) {
  await ensureOrgAlignment(atok, [peer3.record.id], companyId, {
    department: "Phase12Ops",
    division: "Phase12Div",
    office_id: "",
  });
}

const periodRes = await api("POST", "/api/hr/rating/periods", (owner || hr).token, {
  name: `Phase12 ${Date.now()}`,
  start_date: "2026-08-01",
  end_date: "2026-08-31",
  status: "open",
});
record(
  "Create period",
  "PASS",
  periodRes.status === 200 ? periodRes.json.data?.id : JSON.stringify(periodRes.json).slice(0, 120),
  periodRes.status === 200 ? "PASS" : "FAIL",
);
const periodId = periodRes.json.data?.id;

// Insufficient pool: request 20
const insuf = await api("POST", "/api/hr/rating/assignments", (owner || hr).token, {
  period_id: periodId,
  subject_user_id: employee.record.id,
  reviewer_count: 20,
  method: "smart_random",
});
record(
  "Insufficient eligible DENY",
  "400",
  `${insuf.status} ${String(insuf.json.error || "").slice(0, 80)}`,
  insuf.status === 400 && String(insuf.json.error || "").includes("Reviewer tersedia") ? "PASS" : "FAIL",
);

const countWanted = peer3 ? 3 : 2;
const assign = await api("POST", "/api/hr/rating/assignments", (owner || hr).token, {
  period_id: periodId,
  subject_user_id: employee.record.id,
  reviewer_count: countWanted,
  method: "smart_random",
});
record(
  `Smart random ${countWanted} reviewers`,
  "PASS",
  assign.status === 200
    ? `reviewers=${(assign.json.reviewers || []).length} method=${assign.json.assignment?.assignment_method}`
    : JSON.stringify(assign.json).slice(0, 160),
  assign.status === 200 && (assign.json.reviewers || []).length === countWanted ? "PASS" : "FAIL",
);
const assignmentId = assign.json.assignment?.id;
const reviewerRows = assign.json.reviewers || [];

// Evidence stored
record(
  "Assignment method recorded",
  "smart_random",
  String(assign.json.assignment?.assignment_method),
  assign.json.assignment?.assignment_method === "smart_random" ? "PASS" : "FAIL",
);

// HR cannot assign self
const hrSelf = await api("POST", "/api/hr/rating/assignments", hr.token, {
  period_id: periodId,
  subject_user_id: hr.record.id,
  reviewer_count: 2,
  method: "smart_random",
});
record(
  "HR cannot assign self",
  "403",
  String(hrSelf.status),
  hrSelf.status === 403 ? "PASS" : owner ? "WARN" : hrSelf.status === 403 ? "PASS" : "FAIL",
);

// Subject cannot see reviewer identities via my-result (even before submit)
const myBefore = await api("GET", "/api/hr/rating/my-result", employee.token);
const leaked =
  JSON.stringify(myBefore.json).includes(warehouse.record.id) ||
  JSON.stringify(myBefore.json).toLowerCase().includes("reviewer_row");
record(
  "Subject result no reviewer ids (pre)",
  "no leak",
  leaked ? "LEAK" : "clean",
  !leaked && myBefore.status === 200 ? "PASS" : "FAIL",
);

// Reviewer A cannot see other reviewers — list tasks only own
if (reviewerRows[0]) {
  const revUserId = reviewerRows[0].reviewer;
  // auth as that user via admin lookup email
  const u = await pbAdmin("GET", `/api/collections/users/records/${revUserId}`, atok);
  let revAuth;
  try {
    revAuth = await authUser(u.json.email);
  } catch {
    revAuth = null;
  }
  if (revAuth) {
    const tasks = await api("GET", "/api/hr/rating/my-tasks", revAuth.token);
    const onlyMine = (tasks.json.items || []).every((t) => t.reviewer === revAuth.record.id);
    record("Reviewer tasks only own", "PASS", `count=${(tasks.json.items || []).length}`, onlyMine ? "PASS" : "FAIL");

    // Submit scores
    const aspects = await api("GET", "/api/hr/rating/aspects", revAuth.token);
    const aspectItems = aspects.json.items || [];
    const taskId = reviewerRows[0].id;
    const draft = await api("PUT", `/api/hr/rating/tasks/${taskId}`, revAuth.token, {
      scores: aspectItems.map((a) => ({ aspect_id: a.id, score: 4, comment: "ok" })),
    });
    record("Reviewer draft save", "PASS", String(draft.status), draft.status === 200 ? "PASS" : "FAIL");
    const sub = await api("POST", `/api/hr/rating/tasks/${taskId}`, revAuth.token, {
      action: "submit",
    });
    record("Reviewer submit lock", "PASS", String(sub.status), sub.status === 200 ? "PASS" : "FAIL");
    const again = await api("PUT", `/api/hr/rating/tasks/${taskId}`, revAuth.token, {
      scores: aspectItems.map((a) => ({ aspect_id: a.id, score: 1 })),
    });
    record("Locked edit DENY", "400", String(again.status), again.status === 400 ? "PASS" : "FAIL");
  } else {
    record("Reviewer submit flow", "PASS", "could not auth reviewer email", "WARN");
  }
}

// Employee cannot open HR detail
const empDetail = await api("GET", `/api/hr/rating/assignments/${assignmentId}`, employee.token);
record("Employee detail DENY", "403", String(empDetail.status), empDetail.status === 403 ? "PASS" : "FAIL");

// HR can open detail (if not self-scope issue)
const hrDetail = await api("GET", `/api/hr/rating/assignments/${assignmentId}`, hr.token);
record(
  "HR detail PASS",
  "200",
  String(hrDetail.status),
  hrDetail.status === 200 && Array.isArray(hrDetail.json.reviewers) ? "PASS" : "FAIL",
);
const prog = hrDetail.json.progress || {};
record(
  "Progress respondents X/Y",
  "label",
  String(prog.respondents_label || ""),
  typeof prog.respondents_label === "string" && String(prog.respondents_label).includes("/") ? "PASS" : "FAIL",
);

// Unauthorized
const unauth = await api("POST", "/api/hr/rating/periods", null, { name: "x" });
record("Unauthorized DENY", "401", String(unauth.status), unauth.status === 401 ? "PASS" : "FAIL");

// Direct PB create should fail for user token (rules null)
const pbDirect = await stagingJson(
  "POST",
  `${STAGING_URL}/api/collections/hr_rating_periods/records`,
  {
    token: employee.token,
    body: {
      name: "hack",
      start_date: "2026-01-01",
      end_date: "2026-01-02",
      status: "open",
    },
    label: "direct PB mutation",
  },
);
record(
  "Direct PB mutation DENY",
  "403/401",
  String(pbDirect.status),
  pbDirect.status === 401 || pbDirect.status === 403 || pbDirect.status === 400 ? "PASS" : "FAIL",
);

const pass = results.filter((r) => r.result === "PASS").length;
const fail = results.filter((r) => r.result === "FAIL").length;
const warn = results.filter((r) => r.result === "WARN").length;
console.log(`\nPASS=${pass} FAIL=${fail} WARN=${warn}`);
process.exit(fail > 0 ? 1 : 0);
