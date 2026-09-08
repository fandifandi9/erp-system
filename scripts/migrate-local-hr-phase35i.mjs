/**
 * LOCAL-ONLY Phase 35I — module access SSOT collections.
 * Run: npm run migrate:local-hr-phase35i
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

function textField(name, opts = {}) {
  return { name, type: "text", required: false, system: false, options: { min: null, max: null, pattern: "", ...opts } };
}

function boolField(name, required = false) {
  return { name, type: "bool", required, system: false, options: {} };
}

function selectField(name, values, required = false) {
  return {
    name,
    type: "select",
    required,
    system: false,
    options: { maxSelect: 1, values },
  };
}

function relationField(name, collectionId, required = false, maxSelect = 1) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: true, minSelect: null, maxSelect, displayFields: null },
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

const LOCKED_RULES = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

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

async function ensureCollection(token, name, schema, rules = LOCKED_RULES) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (existing.ok) {
    const col = existing.data;
    const merged = ensureFields(col.schema, schema);
    if (merged.length !== (col.schema || []).length) {
      col.schema = merged;
      const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
      if (!patch.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(patch.data).slice(0, 300)}`);
      console.log(`  ✓ ${name} schema updated`);
    } else {
      console.log(`  · ${name} already exists — skip`);
    }
    return col.id;
  }

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users collection missing");
  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);

  const body = {
    name,
    type: "base",
    schema,
    ...rules,
  };
  const created = await pbJson("POST", "/api/collections", body, token);
  if (!created.ok) throw new Error(`CREATE ${name}: ${JSON.stringify(created.data).slice(0, 300)}`);
  console.log(`  ✓ ${name} created`);
  return created.data.id;
}

async function main() {
  console.log("Phase 35I local migration — module access SSOT collections\n");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  const usersId = usersCol.data.id;
  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  const companyId = companyCol.ok ? companyCol.data.id : usersId;

  await ensureCollection(token, "sys_user_module_assignments", [
    relationField("user", usersId, true),
    selectField("module_id", ["hr", "finance", "warehouse", "purchasing", "sales", "pos"], true),
    selectField("access_mode", ["full", "custom"], true),
    selectField("entity_scope_mode", ["selected", "all"], true),
    boolField("desk_enabled", false),
    boolField("is_active", false),
    relationField("granted_by", usersId, false),
    textField("notes"),
  ]);

  const assignCol = await pbJson("GET", "/api/collections/sys_user_module_assignments", null, token);
  const assignId = assignCol.data.id;

  await ensureCollection(token, "sys_user_module_permissions", [
    relationField("assignment", assignId, true),
    textField("permission_key", { min: 1, max: 200 }),
  ]);

  await ensureCollection(token, "sys_user_module_entities", [
    relationField("assignment", assignId, true),
    relationField("company", companyId, true),
  ]);

  console.log("\nPhase 35I local migration OK");
  console.log("No automatic backfill — existing users unchanged (backward compatible).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
