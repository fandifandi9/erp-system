/**
 * Staging-only HR Leave fixture seed.
 *
 * Creates/updates [STAGING]-labeled companies + users only.
 * Never deletes records. Never targets production.
 *
 * Required env (gitignored .env.staging.local or shell):
 *   POCKETBASE_STAGING_URL              e.g. http://127.0.0.1:8092 (via SSH tunnel)
 *   POCKETBASE_STAGING_ADMIN_EMAIL      staging-only admin (not production)
 *   POCKETBASE_STAGING_ADMIN_PASSWORD   staging-only password
 *   STAGING_SEED_PASSWORD               password for dummy fixture users
 *
 * Optional:
 *   STAGING_SEED_INCLUDE_COMPANY_B=1    also HR-B / Staff-B
 *   STAGING_EMAIL_DOMAIN=staging.serba.test
 *   STAGING_SEED_LEAVE_SAMPLES=1        admin-create sample leave rows (default: 1)
 *   STAGING_SEED_DRY_RUN=1              validate guards only; no writes
 *
 * Run from repo root:
 *   npm run seed:hr-leave-staging
 */

import {
  assertStagingOnly,
  loadStagingEnv,
  printStagingUsage,
  requireStagingAdmin,
  requireStagingSeedPassword,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const STAGING_URL = String(env.POCKETBASE_STAGING_URL || "").trim().replace(/\/$/, "");
const DRY_RUN = ["1", "true", "yes"].includes(String(env.STAGING_SEED_DRY_RUN || "").trim().toLowerCase());
const INCLUDE_B = ["1", "true", "yes"].includes(
  String(env.STAGING_SEED_INCLUDE_COMPANY_B || "").trim().toLowerCase(),
);
const SEED_LEAVES = !["0", "false", "no"].includes(
  String(env.STAGING_SEED_LEAVE_SAMPLES ?? "1").trim().toLowerCase(),
);
const EMAIL_DOMAIN = (env.STAGING_EMAIL_DOMAIN || "staging.serba.test").trim();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printStagingUsage("seed-hr-leave-staging");
  process.exit(0);
}

const { url: TARGET } = assertStagingOnly(env, STAGING_URL);
const { email: ADMIN_EMAIL, password: ADMIN_PASS } = requireStagingAdmin(env);
const SEED_PASSWORD = requireStagingSeedPassword(env);

/** Always Company A + Company B. Users for B only if INCLUDE_B. */
const FIXTURE_USERS = [
  {
    slug: "owner",
    label: "Owner",
    name: "[STAGING] Leave Owner",
    account_type: "owner",
    role_code: "owner",
    company: "A",
  },
  {
    slug: "hr-a",
    label: "HR-A",
    name: "[STAGING] Leave HR-A",
    account_type: "user",
    role_code: "hr",
    company: "A",
  },
  {
    slug: "staff-a1",
    label: "Staff-A1",
    name: "[STAGING] Leave Staff-A1",
    account_type: "user",
    role_code: "staff",
    company: "A",
  },
  {
    slug: "staff-a2",
    label: "Staff-A2",
    name: "[STAGING] Leave Staff-A2",
    account_type: "user",
    role_code: "staff",
    company: "A",
  },
];

if (INCLUDE_B) {
  FIXTURE_USERS.push(
    {
      slug: "hr-b",
      label: "HR-B",
      name: "[STAGING] Leave HR-B",
      account_type: "user",
      role_code: "hr",
      company: "B",
    },
    {
      slug: "staff-b",
      label: "Staff-B",
      name: "[STAGING] Leave Staff-B",
      account_type: "user",
      role_code: "staff",
      company: "B",
    },
  );
}

async function adminAuth() {
  const res = await fetch(`${TARGET}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error("Staging admin auth failed (HTTP " + res.status + "). Check staging-only credentials.");
  }
  return data.token;
}

async function findOne(token, collection, filter) {
  const res = await fetch(
    `${TARGET}/api/collections/${collection}/records?perPage=1&filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: token }, signal: AbortSignal.timeout(20000) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`List ${collection} failed: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data.items?.[0] ?? null;
}

async function upsertCompany(token, code, companyName) {
  const existing = await findOne(token, "biz_company_profile", `code = "${code}"`);
  const body = {
    company_name: companyName,
    code,
    is_active: true,
  };
  if (existing) {
    const res = await fetch(`${TARGET}/api/collections/biz_company_profile/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Update company ${code}: ${JSON.stringify(data)}`);
    return { id: data.id, action: "updated", code };
  }
  const res = await fetch(`${TARGET}/api/collections/biz_company_profile/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Create company ${code}: ${JSON.stringify(data)}`);
  return { id: data.id, action: "created", code };
}

async function upsertUser(token, spec) {
  const email = `staging-leave-${spec.slug}@${EMAIL_DOMAIN}`;
  const body = {
    email,
    name: spec.name,
    password: SEED_PASSWORD,
    passwordConfirm: SEED_PASSWORD,
    account_type: spec.account_type,
    role_code: spec.role_code,
    role: spec.role_code,
    dashboard_access: true,
    inventory_role: "none",
    web_access: true,
    status: "active",
    locale: "id",
  };
  const existing = await findOne(token, "users", `email = "${email.replace(/"/g, '\\"')}"`);
  if (existing) {
    // Do not rotate password on every re-seed unless STAGING_SEED_RESET_PASSWORDS=1
    const resetPass = ["1", "true", "yes"].includes(
      String(env.STAGING_SEED_RESET_PASSWORDS || "").trim().toLowerCase(),
    );
    const patchBody = { ...body };
    if (!resetPass) {
      delete patchBody.password;
      delete patchBody.passwordConfirm;
    }
    const res = await fetch(`${TARGET}/api/collections/users/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(patchBody),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Update ${email}: ${JSON.stringify(data)}`);
    return { email, id: data.id, action: "updated", company: spec.company, label: spec.label };
  }
  const res = await fetch(`${TARGET}/api/collections/users/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Create ${email}: ${JSON.stringify(data)}`);
  return { email, id: data.id, action: "created", company: spec.company, label: spec.label };
}

async function ensureProfile(token, userId, name, email) {
  const existing = await findOne(token, "profiles", `user = "${userId}"`);
  const profileBody = {
    user: userId,
    name,
    email,
    shift_start: "08:00",
    shift_end: "17:00",
    profile_status: "incomplete",
    division: "STAGING-DIV",
    position: "STAGING Staff",
  };
  if (existing) {
    const res = await fetch(`${TARGET}/api/collections/profiles/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(profileBody),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Profile update ${email}: ${JSON.stringify(data)}`);
    return { action: "updated", id: data.id };
  }
  const res = await fetch(`${TARGET}/api/collections/profiles/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(profileBody),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Profile create ${email}: ${JSON.stringify(data)}`);
  return { action: "created", id: data.id };
}

async function ensureUserCompany(token, userId, companyId) {
  const existing = await findOne(
    token,
    "biz_user_companies",
    `user = "${userId}" && company = "${companyId}"`,
  );
  if (existing) {
    if (existing.is_active === false) {
      const res = await fetch(`${TARGET}/api/collections/biz_user_companies/records/${existing.id}`, {
        method: "PATCH",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Reactivate user-company: ${JSON.stringify(data)}`);
      return { action: "reactivated", id: data.id };
    }
    return { action: "exists", id: existing.id };
  }
  const res = await fetch(`${TARGET}/api/collections/biz_user_companies/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ user: userId, company: companyId, is_active: true }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Create user-company: ${JSON.stringify(data)}`);
  return { action: "created", id: data.id };
}

/**
 * Idempotent sample leave for direct-PB update tests. Never deletes.
 * Staging schema (verified): user, date, devision, status, note, hr_action_*.
 * Do NOT filter on missing fields (reason/start_date) — PB returns HTTP 400.
 */
async function ensureSampleLeave(token, userId, label) {
  const marker = `[STAGING] sample leave for ${label}`;
  const existing = await findOne(
    token,
    "leave_requests",
    `user = "${userId}" && note ~ "[STAGING] sample leave"`,
  );
  if (existing) return { action: "exists", id: existing.id };

  const start = new Date();
  start.setDate(start.getDate() + 14);
  const ymd = start.toISOString().slice(0, 10);
  const body = {
    user: userId,
    date: ymd,
    status: "pending",
    devision: "STAGING-DIV",
    note: marker,
  };
  const res = await fetch(`${TARGET}/api/collections/leave_requests/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Sample leave for ${label}: ${JSON.stringify(data)}`);
  }
  return { action: "created", id: data.id };
}

console.log("=== [STAGING] Seed HR Leave fixtures ===");
console.log(`Target: ${TARGET}`);
console.log(`Include Company-B users: ${INCLUDE_B}`);
console.log(`Sample leave rows: ${SEED_LEAVES}`);
console.log(`Dry run: ${DRY_RUN}`);
console.log("Guards: refuse pb.serba.space, refuse NEXT_PUBLIC_POCKETBASE_URL match, refuse port 8091,");
console.log("        refuse production admin email/password reuse, no auto-delete.");

if (DRY_RUN) {
  console.log("DRY RUN OK — guards passed; no writes performed.");
  process.exit(0);
}

const token = await adminAuth();

const companyA = await upsertCompany(token, "STG-LEAVE-A", "[STAGING] Leave Company A");
console.log(`Company A: ${companyA.id} (${companyA.action})`);
const companyB = await upsertCompany(token, "STG-LEAVE-B", "[STAGING] Leave Company B");
console.log(`Company B: ${companyB.id} (${companyB.action})`);

const companies = { A: companyA, B: companyB };
const results = [];
const userBySlug = {};

for (const spec of FIXTURE_USERS) {
  try {
    const u = await upsertUser(token, spec);
    const p = await ensureProfile(token, u.id, spec.name, u.email);
    const co = companies[spec.company];
    let link = { action: "skipped" };
    if (co?.id) {
      link = await ensureUserCompany(token, u.id, co.id);
    }
    userBySlug[spec.slug] = u;
    results.push({ ...u, profile: p.action, link: link.action, ok: true });
    console.log(`OK ${spec.label}: ${u.email} (${u.action}, profile ${p.action}, link ${link.action})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ label: spec.label, ok: false, error: msg });
    console.error(`FAIL ${spec.label}:`, msg);
  }
}

if (SEED_LEAVES) {
  for (const slug of ["staff-a1", "staff-a2"]) {
    const u = userBySlug[slug];
    if (!u?.id) continue;
    try {
      const lv = await ensureSampleLeave(token, u.id, u.label);
      console.log(`OK sample leave ${u.label}: ${lv.id} (${lv.action})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL sample leave ${u.label}:`, msg);
      results.push({ label: `leave-${slug}`, ok: false, error: msg });
    }
  }
}

console.log("\nSummary (emails — password = STAGING_SEED_PASSWORD):");
for (const r of results) {
  if (r.ok) console.log(`  ${r.label}: ${r.email}`);
  else console.log(`  FAIL ${r.label}: ${r.error}`);
}
console.log("\nNo records were deleted. Production was not targeted.");

const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);
