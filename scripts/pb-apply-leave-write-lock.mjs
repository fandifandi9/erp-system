/**
 * Apply leave_requests write-lock (create/update/delete = null) to STAGING only.
 *
 * Usage:
 *   npm run pb:leave-write-lock:staging
 *
 * Requires POCKETBASE_STAGING_* only — never falls back to production ADMIN_*.
 * Refuses pb.serba.space, port 8091, and NEXT_PUBLIC_POCKETBASE_URL match.
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
  printStagingUsage("pb-apply-leave-write-lock");
  process.exit(0);
}

const { url: TARGET, host } = assertStagingOnly(env, STAGING_URL);
const { email: ADMIN_EMAIL, password: ADMIN_PASS } = requireStagingAdmin(env);

const LIST_VIEW_RULE =
  '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.role_code = "owner" || @request.auth.account_type = "owner")';

async function main() {
  console.log("Target staging host:", host);
  console.log("URL:", TARGET);
  console.log("Applying leave_requests write-lock (create/update/delete = null).");
  console.log("Production will NOT be modified.");

  const authRes = await fetch(TARGET + "/api/admins/auth-with-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
    signal: AbortSignal.timeout(20000),
  });
  const auth = await authRes.json().catch(() => ({}));
  if (!authRes.ok || !auth.token) {
    console.error("Admin auth failed:", authRes.status);
    process.exit(1);
  }

  const colRes = await fetch(TARGET + "/api/collections?perPage=200", {
    headers: { Authorization: auth.token },
    signal: AbortSignal.timeout(20000),
  });
  const colJson = await colRes.json();
  const leave = (colJson.items || []).find((c) => c.name === "leave_requests");
  if (!leave) {
    console.error("leave_requests collection not found on staging");
    process.exit(1);
  }

  console.log("BEFORE:");
  console.log("  listRule=", JSON.stringify(leave.listRule));
  console.log("  viewRule=", JSON.stringify(leave.viewRule));
  console.log("  createRule=", JSON.stringify(leave.createRule));
  console.log("  updateRule=", JSON.stringify(leave.updateRule));
  console.log("  deleteRule=", JSON.stringify(leave.deleteRule));

  const payload = {
    ...leave,
    listRule: leave.listRule || LIST_VIEW_RULE,
    viewRule: leave.viewRule || LIST_VIEW_RULE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  const patchRes = await fetch(TARGET + "/api/collections/" + leave.id, {
    method: "PATCH",
    headers: {
      Authorization: auth.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const patched = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, JSON.stringify(patched));
    process.exit(1);
  }

  console.log("AFTER:");
  console.log("  listRule=", JSON.stringify(patched.listRule));
  console.log("  viewRule=", JSON.stringify(patched.viewRule));
  console.log("  createRule=", JSON.stringify(patched.createRule));
  console.log("  updateRule=", JSON.stringify(patched.updateRule));
  console.log("  deleteRule=", JSON.stringify(patched.deleteRule));
  console.log("OK — staging leave_requests write rules locked (null).");
  console.log("Production was not modified.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
