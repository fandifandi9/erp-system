/**
 * LOCAL-ONLY: izinkan HR/Owner simpan karyawan + lengkapi schema profiles.
 *
 * Run: node scripts/migrate-local-hr-employee-write.mjs
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
  };
}

import { buildUsersUpdateRulePbExpression } from "./pb-user-privilege-rule.mjs";

const HR_OR_OWNER =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

const USERS_UPDATE_RULE = buildUsersUpdateRulePbExpression();

const PROFILES_RULES = {
  listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
  viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

const HR_OPTIONS_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

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

console.log("Target:", url);

const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
if (!auth.data?.token) {
  console.error("Admin auth failed", auth.status);
  process.exit(1);
}
const token = auth.data.token;
console.log("Admin auth OK");

// --- users.updateRule ---
const usersRes = await pbJson("GET", "/api/collections/users", null, token);
if (!usersRes.ok) {
  console.error("GET users failed");
  process.exit(1);
}
const users = usersRes.data;
users.schema = ensureFields(users.schema, [textField("hr_role_preset")]);
users.updateRule = USERS_UPDATE_RULE;
const usersPatch = await pbJson("PATCH", "/api/collections/users", users, token);
if (!usersPatch.ok) {
  console.error("PATCH users failed", JSON.stringify(usersPatch.data).slice(0, 300));
  process.exit(1);
}
console.log("users.updateRule → Phase 33A privilege guard (self session nonces only)");

const usersId = users.id;

// --- profiles schema + rules ---
const profileFields = [
  relationField("user", usersId, true),
  textField("name"),
  textField("email"),
  textField("position"),
  textField("department"),
  textField("division"),
  textField("phone"),
  textField("address"),
  textField("nik"),
  textField("npwp"),
  textField("employee_code"),
  textField("office_id"),
  numberField("salary"),
  numberField("late_tolerance"),
  textField("shift_start"),
  textField("shift_end"),
  textField("shift_start_saturday"),
  textField("shift_end_saturday"),
  textField("shift_start_sunday"),
  textField("shift_end_sunday"),
  textField("shift_start_weekend"),
  textField("shift_end_weekend"),
  dateField("join_date"),
  boolField("require_checkin_selfie"),
  numberField("leave_bookings_quota"),
  numberField("leave_daily_rate"),
  numberField("extra_bonus_amount"),
  boolField("extra_bonus_enabled"),
  numberField("late_deduction_rupiah_per_minute"),
  numberField("absence_deduction_rupiah_per_day"),
  selectField("profile_status", ["incomplete", "complete", "draft", "active"]),
];

const profilesRes = await pbJson("GET", "/api/collections/profiles", null, token);
if (profilesRes.ok) {
  const col = profilesRes.data;
  col.schema = ensureFields(col.schema, profileFields);
  Object.assign(col, PROFILES_RULES);
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) {
    console.error("PATCH profiles failed", JSON.stringify(patch.data).slice(0, 400));
    process.exit(1);
  }
  console.log("profiles schema/rules updated");
} else {
  const create = await pbJson(
    "POST",
    "/api/collections",
    { name: "profiles", type: "base", schema: profileFields, ...PROFILES_RULES },
    token,
  );
  if (!create.ok) {
    console.error("CREATE profiles failed", JSON.stringify(create.data).slice(0, 400));
    process.exit(1);
  }
  console.log("profiles collection created");
}

// --- hr_employee_options rules ---
const optsRes = await pbJson("GET", "/api/collections/hr_employee_options", null, token);
if (optsRes.ok) {
  const col = optsRes.data;
  Object.assign(col, HR_OPTIONS_RULES);
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) {
    console.error("PATCH hr_employee_options failed", JSON.stringify(patch.data).slice(0, 300));
    process.exit(1);
  }
  console.log("hr_employee_options rules updated (HR/Owner + account_type)");
} else {
  console.log("hr_employee_options not found — run migrate-local-hr-employee-options.mjs first");
}

console.log("Done. Refresh halaman karyawan dan coba Simpan lagi.");
