/**
 * LOCAL-ONLY Phase FLEX-ORG-02 — Management groups + functional operating models.
 * Run: npm run migrate:local-flex-org-02
 * NO production / serba.space / :8091 / :8092.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
  };
}

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function boolField(name, required = false) {
  return { name, type: "bool", required, system: false, options: {} };
}
function selectField(name, values, required = false) {
  return { name, type: "select", required, system: false, options: { maxSelect: 1, values } };
}
function dateField(name, required = false) {
  return { name, type: "date", required, system: false, options: {} };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: true, minSelect: null, maxSelect: 1, displayFields: null },
  };
}

const LOCKED = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

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

async function ensureCollection(token, name, schema) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (existing.ok) {
    const col = existing.data;
    const key = Array.isArray(col.schema) ? "schema" : "fields";
    const current = col[key] || [];
    const names = new Set(current.map((f) => f.name));
    const toAdd = schema.filter((f) => !names.has(f.name));
    if (toAdd.length === 0) {
      console.log(`OK ${name}`);
      return col;
    }
    const patch = await pbJson("PATCH", `/api/collections/${col.id}`, { ...col, [key]: [...current, ...toAdd] }, token);
    if (!patch.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(patch.data)}`);
    console.log(`UPDATED ${name}: +${toAdd.map((f) => f.name).join(",")}`);
    return patch.data;
  }

  const created = await pbJson(
    "POST",
    "/api/collections",
    {
      name,
      type: "base",
      schema,
      ...LOCKED,
    },
    token,
  );
  if (!created.ok) throw new Error(`CREATE ${name}: ${JSON.stringify(created.data)}`);
  console.log(`CREATED ${name}`);
  return created.data;
}

async function main() {
  console.log("=== LOCAL migrate Phase FLEX-ORG-02 ===");
  console.log("PB:", url);

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error(`Admin auth failed: ${JSON.stringify(auth.data)}`);
  const token = auth.data.token;

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const companyId = companyCol.data.id;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  const usersId = usersCol.ok ? usersCol.data.id : companyId;

  const groups = await ensureCollection(token, "sys_management_groups", [
    textField("code", true),
    textField("name", true),
    boolField("is_active", false),
    textField("notes", false),
  ]);

  await ensureCollection(token, "sys_management_group_entities", [
    relationField("management_group", groups.id, true),
    relationField("company", companyId, true),
  ]);

  const models = await ensureCollection(token, "sys_functional_operating_models", [
    relationField("management_group", groups.id, true),
    selectField("function_domain", ["hr", "finance", "sales", "warehouse", "purchasing", "pos"], true),
    selectField("mode", ["SHARED", "SEPARATED"], true),
    selectField("shared_scope_kind", ["ALL_IN_MANAGEMENT", "SELECTED"], false),
    dateField("effective_from", true),
    textField("notes", false),
    relationField("updated_by", usersId, false),
  ]);

  await ensureCollection(token, "sys_functional_operating_model_entities", [
    relationField("operating_model", models.id, true),
    relationField("company", companyId, true),
  ]);

  await ensureCollection(token, "sys_functional_operating_model_audit", [
    relationField("management_group", groups.id, true),
    selectField("function_domain", ["hr", "finance", "sales", "warehouse", "purchasing", "pos"], true),
    textField("previous_mode", false),
    selectField("new_mode", ["SHARED", "SEPARATED"], true),
    dateField("effective_from", true),
    relationField("changed_by", usersId, false),
    textField("notes", false),
  ]);

  console.log("DONE — FLEX-ORG-02 local schema ready");
  console.log("Compat: biz_company_profile.management_group text retained");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
