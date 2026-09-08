/**
 * LOCAL-ONLY Phase 33A: tighten users.updateRule — block client privilege escalation.
 *
 * Self may only patch session nonces via PocketBase client.
 * Password, privilege, operational, and company scope fields → server APIs only.
 *
 * Run: npm run migrate:local-hr-phase33a
 */

import fs from "fs";
import path from "path";
import { buildUsersUpdateRulePbExpression } from "./pb-user-privilege-rule.mjs";

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

const USERS_UPDATE_RULE = buildUsersUpdateRulePbExpression();

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
  console.log("Phase 33A local migration — users.updateRule (privilege hardening)");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users collection missing");

  const col = usersCol.data;
  const before = col.updateRule;
  col.updateRule = USERS_UPDATE_RULE;

  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) {
    throw new Error(`PATCH users failed: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }

  console.log("  Before:", before);
  console.log("  After: ", USERS_UPDATE_RULE);
  console.log("Phase 33A users privilege migration OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
