/**
 * LOCAL-ONLY FLEX-ORG-05-FIX — tighten leave_requests list/view to self.
 * Run: npm run migrate:local-flex-org-05-fix
 * Blocks production / staging URLs.
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local missing");
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

const { url, email, pass } = loadEnv();
if (
  !url ||
  !email ||
  !pass ||
  url.includes("serba.space") ||
  url.includes(":8091") ||
  url.includes(":8092")
) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

const SELF_ONLY = '@request.auth.id != "" && user = @request.auth.id';

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("=== LOCAL migrate FLEX-ORG-05-FIX leave self list/view ===");
  console.log("PB:", url);
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error(`Admin auth failed: ${auth.status}`);
  const token = auth.data.token;

  const colRes = await pbJson("GET", "/api/collections/leave_requests", null, token);
  if (!colRes.ok) throw new Error("leave_requests collection missing");
  const col = colRes.data;
  const payload = {
    listRule: SELF_ONLY,
    viewRule: SELF_ONLY,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, payload, token);
  if (!patch.ok) throw new Error(`PATCH leave_requests failed: ${JSON.stringify(patch.data)}`);
  console.log("leave_requests list/view = SELF ONLY; writes remain null");
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
