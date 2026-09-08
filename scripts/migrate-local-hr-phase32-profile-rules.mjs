/**
 * LOCAL-ONLY Phase 32: tighten profiles.updateRule — HR/Owner only (no self direct PB mutation).
 *
 * Self-service profile updates must use /api/profile/self (server allowlist).
 *
 * Run: npm run migrate:local-hr-phase32
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
  };
}

const HR_OR_OWNER =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

const PROFILES_UPDATE_RULE_HR_ONLY = `@request.auth.id != "" && (${HR_OR_OWNER})`;

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("Phase 32 local migration — profiles.updateRule (HR/Owner only)");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!profilesCol.ok) throw new Error("profiles collection missing");

  const col = profilesCol.data;
  const before = col.updateRule;
  col.updateRule = PROFILES_UPDATE_RULE_HR_ONLY;

  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) {
    throw new Error(`PATCH profiles failed: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }

  console.log("  Before:", before);
  console.log("  After: ", PROFILES_UPDATE_RULE_HR_ONLY);
  console.log("Phase 32 profile security migration OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
