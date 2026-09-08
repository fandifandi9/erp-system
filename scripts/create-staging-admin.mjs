/**
 * One-time: create staging-only PocketBase admin after restore clone.
 *
 * After Phase 10 restore, staging PB contains the production admin account.
 * This script uses an explicit BOOTSTRAP admin (the post-restore admin) to
 * create a dedicated STAGING admin, then verifies the new admin can log in.
 *
 * Never targets production hosts. Never prints passwords.
 *
 * Required env (.env.staging.local or shell):
 *   POCKETBASE_STAGING_URL
 *   POCKETBASE_STAGING_BOOTSTRAP_ADMIN_EMAIL
 *   POCKETBASE_STAGING_BOOTSTRAP_ADMIN_PASSWORD
 *   POCKETBASE_STAGING_ADMIN_EMAIL          (new dedicated staging admin)
 *   POCKETBASE_STAGING_ADMIN_PASSWORD       (new dedicated staging password)
 *
 * Optional:
 *   POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD — used only to refuse
 *   staging admin equal to production.
 *
 * Usage:
 *   node scripts/create-staging-admin.mjs
 */
import {
  assertStagingOnly,
  loadStagingEnv,
  hostOf,
} from "./lib/staging-guard.mjs";

const env = loadStagingEnv();
const { url: TARGET } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);

const bootstrapEmail = String(env.POCKETBASE_STAGING_BOOTSTRAP_ADMIN_EMAIL || "").trim();
const bootstrapPass = String(env.POCKETBASE_STAGING_BOOTSTRAP_ADMIN_PASSWORD || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const stagingEmail = String(env.POCKETBASE_STAGING_ADMIN_EMAIL || "").trim();
const stagingPass = String(env.POCKETBASE_STAGING_ADMIN_PASSWORD || "")
  .trim()
  .replace(/^["']|["']$/g, "");
const prodEmail = String(env.POCKETBASE_ADMIN_EMAIL || "").trim();
const prodPass = String(env.POCKETBASE_ADMIN_PASSWORD || "")
  .trim()
  .replace(/^["']|["']$/g, "");

function fail(msg) {
  console.error("BLOCKED —", msg);
  process.exit(2);
}

if (!bootstrapEmail || !bootstrapPass) {
  fail(
    "require POCKETBASE_STAGING_BOOTSTRAP_ADMIN_EMAIL and POCKETBASE_STAGING_BOOTSTRAP_ADMIN_PASSWORD (post-restore admin, one-time).",
  );
}
if (!stagingEmail || !stagingPass) {
  fail("require POCKETBASE_STAGING_ADMIN_EMAIL and POCKETBASE_STAGING_ADMIN_PASSWORD (new dedicated staging admin).");
}
if (stagingPass.length < 8) {
  fail("POCKETBASE_STAGING_ADMIN_PASSWORD must be at least 8 characters.");
}
if (prodEmail && stagingEmail.toLowerCase() === prodEmail.toLowerCase()) {
  fail("staging admin email must not equal POCKETBASE_ADMIN_EMAIL (production).");
}
if (prodPass && stagingPass === prodPass) {
  fail("staging admin password must not equal POCKETBASE_ADMIN_PASSWORD (production).");
}
if (stagingEmail.toLowerCase() === bootstrapEmail.toLowerCase()) {
  fail("new staging admin email must differ from bootstrap email.");
}

async function authAdmin(email, password) {
  const res = await fetch(`${TARGET}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && Boolean(data.token), status: res.status, token: data.token || null, message: data.message || "" };
}

console.log("=== Create staging-only admin ===");
console.log("TARGET", TARGET, "(" + hostOf(TARGET) + ")");

const boot = await authAdmin(bootstrapEmail, bootstrapPass);
if (!boot.ok) {
  console.error(`Bootstrap admin auth failed HTTP ${boot.status} ${boot.message}`);
  console.error("Set POCKETBASE_STAGING_BOOTSTRAP_* to the admin that exists on the restored staging clone.");
  process.exit(1);
}
console.log("[PASS] Bootstrap admin authenticated");

// If staging admin already works, stop.
const existing = await authAdmin(stagingEmail, stagingPass);
if (existing.ok) {
  console.log("[PASS] Staging admin already authenticates — nothing to create");
  process.exit(0);
}

const createRes = await fetch(`${TARGET}/api/admins`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: boot.token,
  },
  body: JSON.stringify({
    email: stagingEmail,
    password: stagingPass,
    passwordConfirm: stagingPass,
  }),
});
const createData = await createRes.json().catch(() => ({}));
if (!createRes.ok) {
  // 400 may mean already exists with different password
  console.error(`Create admin failed HTTP ${createRes.status}:`, createData.message || JSON.stringify(createData).slice(0, 200));
  process.exit(1);
}
console.log("[PASS] Staging admin created id=" + (createData.id || "ok"));

const verify = await authAdmin(stagingEmail, stagingPass);
if (!verify.ok) {
  console.error("Verify staging admin login failed after create");
  process.exit(1);
}
console.log("[PASS] Staging admin login verified");
console.log("Done. Use POCKETBASE_STAGING_ADMIN_* for tests. Do not use bootstrap/prod admin for staging scripts.");
