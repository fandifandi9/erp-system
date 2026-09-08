/**
 * Staging-only: attach smoke-employee to an active office with lat/lng/radius.
 * Does not touch production. Does not change attendance GPS logic.
 *
 *   npm run seed:hr-attendance-office-staging
 */

import {
  assertStagingOnly,
  loadStagingEnv,
  printStagingUsage,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const STAGING_URL = String(env.POCKETBASE_STAGING_URL || "").trim().replace(/\/$/, "");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printStagingUsage("seed-hr-attendance-office-staging");
  process.exit(0);
}

const { url: TARGET } = assertStagingOnly(env, STAGING_URL);
const admin = requireStagingAdmin(env);
const pass = String(env.SMOKE_PASSWORD || "").trim();
const domain = String(env.SMOKE_EMAIL_DOMAIN || "serba.test").trim();
if (!pass) {
  console.error("BLOCKED — SMOKE_PASSWORD required");
  process.exit(2);
}

function officeOk(o) {
  return (
    o &&
    o.is_active !== false &&
    o.lat != null &&
    o.lng != null &&
    Number.isFinite(Number(o.lat)) &&
    Number.isFinite(Number(o.lng))
  );
}

const authRes = await fetch(`${TARGET}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: admin.email, password: admin.password }),
});
const auth = await authRes.json().catch(() => ({}));
if (!auth.token) {
  console.error("Admin auth failed", authRes.status);
  process.exit(1);
}
const token = auth.token;

const empAuth = await fetch(`${TARGET}/api/collections/users/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: `smoke-employee@${domain}`, password: pass }),
});
const emp = await empAuth.json().catch(() => ({}));
if (!emp.record?.id) {
  console.error("smoke-employee auth failed", empAuth.status);
  process.exit(1);
}

const userId = emp.record.id;
if (String(emp.record.status || "active").toLowerCase() !== "active") {
  await fetch(`${TARGET}/api/collections/users/records/${userId}`, {
    method: "PATCH",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" }),
  });
  console.log("Set smoke-employee status=active");
}

const offices = await fetch(`${TARGET}/api/collections/offices/records?perPage=50`, {
  headers: { Authorization: token },
}).then((r) => r.json());
const office = (offices.items || []).find(officeOk);
if (!office) {
  console.error("No active office with lat/lng on staging");
  process.exit(1);
}

const profList = await fetch(
  `${TARGET}/api/collections/profiles/records?perPage=1&filter=${encodeURIComponent(`user="${userId}"`)}`,
  { headers: { Authorization: token } },
).then((r) => r.json());
const profile = profList.items?.[0];
if (!profile?.id) {
  console.error("smoke-employee profile missing");
  process.exit(1);
}

const patch = await fetch(`${TARGET}/api/collections/profiles/records/${profile.id}`, {
  method: "PATCH",
  headers: { Authorization: token, "Content-Type": "application/json" },
  body: JSON.stringify({ office_id: office.id }),
});
if (!patch.ok) {
  const body = await patch.json().catch(() => ({}));
  console.error("Failed to set office_id", patch.status, JSON.stringify(body).slice(0, 200));
  process.exit(1);
}

const companies = await fetch(`${TARGET}/api/collections/biz_company_profile/records?perPage=5`, {
  headers: { Authorization: token },
}).then((r) => r.json());
const companyId = (companies.items || []).find((c) => c.is_active)?.id;
if (companyId) {
  const mem = await fetch(
    `${TARGET}/api/collections/biz_user_companies/records?perPage=1&filter=${encodeURIComponent(
      `user="${userId}" && company="${companyId}"`,
    )}`,
    { headers: { Authorization: token } },
  ).then((r) => r.json());
  if (!(mem.items || []).length) {
    await fetch(`${TARGET}/api/collections/biz_user_companies/records`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ user: userId, company: companyId, is_active: true }),
    });
    console.log("Added company membership");
  }
}

const verify = await fetch(
  `${TARGET}/api/collections/profiles/records/${profile.id}?expand=office_id`,
  { headers: { Authorization: token } },
).then((r) => r.json());
if (!verify.office_id) {
  console.error("office_id still empty after PATCH");
  process.exit(1);
}
console.log("OK staging smoke-employee office fixture:");
console.log("  office_id set:", Boolean(verify.office_id));
console.log("  office active:", verify.expand?.office_id?.is_active !== false);
console.log("  has lat/lng:", verify.expand?.office_id?.lat != null && verify.expand?.office_id?.lng != null);
console.log("  has radius:", verify.expand?.office_id?.radius != null);
console.log("Production not modified.");
