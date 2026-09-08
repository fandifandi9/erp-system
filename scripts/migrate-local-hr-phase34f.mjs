/**
 * LOCAL-ONLY Phase 34F: entity attendance policy SSOT + payslip PIN fields.
 *
 * Run: npm run migrate:local-hr-phase34f
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

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: true } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
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
function selectField(name, values) {
  return { name, type: "select", required: false, system: false, options: { maxSelect: 1, values } };
}

const HR_OR_OWNER_EXPR =
  '@request.auth.role = "owner" || @request.auth.account_type = "owner" || @request.auth.role = "hr" || @request.auth.account_type = "hr"';

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

function ensureFields(schema, extras, label) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  let changed = false;
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      changed = true;
      console.log(`  + ${label}.${f.name}`);
    } else {
      console.log(`  OK: ${label}.${f.name}`);
    }
  }
  return { schema: next, changed };
}

async function main() {
  console.log("Phase 34F local migration — attendance policy SSOT + payslip PIN");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const companyCollectionId = companyCol.data.id;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users missing");
  const usersId = usersCol.data.id;

  // profiles — payslip PIN fields
  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!profilesCol.ok) throw new Error("profiles missing");
  const profCol = profilesCol.data;
  const pinFields = [
    textField("payslip_pin_hash"),
    numberField("payslip_pin_failed_attempts"),
    textField("payslip_pin_locked_until"),
  ];
  const { schema: profSchema, changed: profChanged } = ensureFields(
    profCol.schema ?? profCol.fields ?? [],
    pinFields,
    "profiles",
  );
  if (profChanged) {
    profCol.schema = profSchema;
    const patch = await pbJson("PATCH", `/api/collections/${profCol.id}`, profCol, token);
    if (!patch.ok) throw new Error(`PATCH profiles: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }

  // payroll_items — policy snapshot
  const itemsCol = await pbJson("GET", "/api/collections/payroll_items", null, token);
  if (!itemsCol.ok) throw new Error("payroll_items missing");
  const itemCol = itemsCol.data;
  const policySnapFields = [textField("attendance_policy_id"), textField("attendance_policy_snapshot")];
  const { schema: itemSchema, changed: itemChanged } = ensureFields(
    itemCol.schema ?? itemCol.fields ?? [],
    policySnapFields,
    "payroll_items",
  );
  if (itemChanged) {
    itemCol.schema = itemSchema;
    const patch = await pbJson("PATCH", `/api/collections/${itemCol.id}`, itemCol, token);
    if (!patch.ok) throw new Error(`PATCH payroll_items: ${JSON.stringify(patch.data).slice(0, 400)}`);
  }

  // hr_entity_attendance_policies collection
  const policyRules = {
    listRule: `@request.auth.id != "" && (status = "published" || ${HR_OR_OWNER_EXPR})`,
    viewRule: `@request.auth.id != "" && (status = "published" || ${HR_OR_OWNER_EXPR})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
  };

  const attendancePolicyFields = [
    relationField("company_id", companyCollectionId, false),
    selectField("status", ["draft", "published", "archived"]),
    dateField("effective_from"),
    dateField("effective_until"),
    boolField("late_enabled"),
    numberField("late_grace_minutes"),
    numberField("late_rate_per_minute"),
    boolField("absence_enabled"),
    numberField("absence_rate_per_day"),
    textField("notes"),
    relationField("created_by", usersId, false),
    relationField("published_by", usersId, false),
    relationField("updated_by", usersId, false),
    textField("published_at"),
    boolField("is_demo"),
    textField("demo_seed_key"),
  ];

  const attExisting = await pbJson("GET", "/api/collections/hr_entity_attendance_policies", null, token);
  if (attExisting.ok) {
    console.log("hr_entity_attendance_policies exists — updating schema/rules");
    const aCol = attExisting.data;
    const { schema: aSchema } = ensureFields(
      aCol.schema ?? aCol.fields ?? [],
      attendancePolicyFields,
      "hr_entity_attendance_policies",
    );
    aCol.schema = aSchema;
    Object.assign(aCol, policyRules);
    await pbJson("PATCH", `/api/collections/${aCol.id}`, aCol, token);
  } else {
    const created = await pbJson(
      "POST",
      "/api/collections",
      {
        name: "hr_entity_attendance_policies",
        type: "base",
        schema: attendancePolicyFields,
        ...policyRules,
      },
      token,
    );
    if (!created.ok) {
      throw new Error(`CREATE hr_entity_attendance_policies: ${JSON.stringify(created.data).slice(0, 400)}`);
    }
    console.log("hr_entity_attendance_policies created");
  }

  console.log("Phase 34F migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
