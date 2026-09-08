/**
 * LOCAL-ONLY Phase 31 migration: profiles.manager (nullable relation → users).
 *
 * Run: node scripts/migrate-local-hr-phase31.mjs
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

function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  for (const f of extras) {
    if (!names.has(f.name)) next.push(f);
  }
  return next;
}

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
  console.log("Phase 31 local migration — profiles.manager");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users collection missing");
  const usersId = usersCol.data.id;

  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!profilesCol.ok) throw new Error("profiles collection missing");

  const col = profilesCol.data;
  const hasManager = (col.schema || []).some((f) => f.name === "manager");
  if (hasManager) {
    console.log("  · profiles.manager already exists — skip");
    return;
  }

  col.schema = ensureFields(col.schema, [relationField("manager", usersId, false)]);
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) {
    throw new Error(`PATCH profiles failed: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }
  console.log("  ✓ profiles.manager added (nullable → users)");
  console.log("Phase 31 local migration OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
