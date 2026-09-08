/**
 * LOCAL-ONLY Phase 33B: Work Schedule / Shift collections.
 *
 * Run: npm run migrate:local-hr-phase33b
 */

import fs from "fs";
import path from "path";

const HR_OR_OWNER =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

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

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: false } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}
function selectField(name, values) {
  return { name, type: "select", required: false, system: false, options: { maxSelect: 1, values } };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
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

async function ensureCollection(token, name, schema, rules) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (existing.ok && existing.data?.id) {
    const col = existing.data;
    col.schema = ensureFields(col.schema, schema);
    Object.assign(col, rules);
    const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
    if (!patch.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(patch.data).slice(0, 300)}`);
    console.log(`  updated collection: ${name}`);
    return col.id;
  }
  const created = await pbJson(
    "POST",
    "/api/collections",
    { name, type: "base", schema, ...rules },
    token,
  );
  if (!created.ok) throw new Error(`CREATE ${name}: ${JSON.stringify(created.data).slice(0, 300)}`);
  console.log(`  created collection: ${name}`);
  return created.data.id;
}

async function main() {
  console.log("Phase 33B local migration — work schedule collections");
  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!usersCol.ok || !companyCol.ok) throw new Error("users or biz_company_profile missing");
  const usersId = usersCol.data.id;
  const companyId = companyCol.data.id;

  const hrManageRules = {
    listRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    viewRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
  };

  const schedulesId = await ensureCollection(
    token,
    "hr_work_schedules",
    [
      relationField("company", companyId, true),
      textField("name", true),
      textField("code"),
      selectField("schedule_type", ["fixed", "shift"]),
      textField("timezone"),
      dateField("effective_from"),
      dateField("effective_to"),
      boolField("is_active"),
      numberField("late_grace_minutes"),
      numberField("early_leave_grace_minutes"),
    ],
    hrManageRules,
  );

  await ensureCollection(
    token,
    "hr_work_schedule_days",
    [
      relationField("schedule", schedulesId, true),
      numberField("weekday"),
      textField("start_time"),
      textField("end_time"),
      textField("break_start"),
      textField("break_end"),
      boolField("is_working_day"),
    ],
    hrManageRules,
  );

  const assignmentRules = {
    listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
    viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
  };

  await ensureCollection(
    token,
    "hr_employee_work_schedules",
    [
      relationField("user", usersId, true),
      relationField("schedule", schedulesId, true),
      dateField("effective_from", true),
      dateField("effective_to"),
      boolField("is_active"),
    ],
    assignmentRules,
  );

  console.log("Phase 33B work schedule migration OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
