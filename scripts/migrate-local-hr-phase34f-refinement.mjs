/**
 * LOCAL-ONLY Phase 34F refinement: payroll bank accounts, payslip bank/logo snapshots, entity logo.
 * Run: npm run migrate:local-hr-phase34f-refinement
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
  return { url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""), email: get("POCKETBASE_ADMIN_EMAIL"), pass: get("POCKETBASE_ADMIN_PASSWORD") };
}

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}
function selectField(name, values, required = false) {
  return { name, type: "select", required, system: false, options: { maxSelect: 1, values } };
}
function relationField(name, collectionId, required = false) {
  return {
    name, type: "relation", required, system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function fileField(name) {
  return {
    name, type: "file", required: false, system: false,
    options: { maxSelect: 1, maxSize: 2097152, mimeTypes: ["image/jpeg", "image/png", "image/webp"], thumbs: ["100x100", "200x200"] },
  };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  let changed = false;
  for (const f of extras) {
    if (!names.has(f.name)) { next.push(f); changed = true; console.log(`  + field ${f.name}`); }
    else console.log(`  OK: ${f.name}`);
  }
  return { schema: next, changed };
}

const HR_OR_OWNER = '@request.auth.role = "owner" || @request.auth.account_type = "owner" || @request.auth.role = "hr" || @request.auth.account_type = "hr"';

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL only");
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

async function patchCollection(token, name, patch) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (!existing.ok) throw new Error(`Collection ${name} missing`);
  const col = existing.data;
  Object.assign(col, patch);
  const res = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!res.ok) throw new Error(`PATCH ${name} failed: ${JSON.stringify(res.data)}`);
}

async function ensureCollection(token, name, schema, rules) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (existing.ok && existing.data?.id) {
    const { schema: next, changed } = ensureFields(existing.data.schema, schema);
    if (changed) {
      await patchCollection(token, name, { schema: next, ...rules });
    }
    return existing.data.id;
  }
  const created = await pbJson("POST", "/api/collections", { name, type: "base", schema, ...rules }, token);
  if (!created.ok) throw new Error(`Create ${name} failed`);
  return created.data.id;
}

async function main() {
  console.log("Phase 34F refinement migration — bank accounts + logo + payslip snapshots");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;
  const usersId = (await pbJson("GET", "/api/collections/users", null, token)).data.id;

  const bankRules = {
    listRule: `@request.auth.id != "" && (user = @request.auth.id || (${HR_OR_OWNER}))`,
    viewRule: `@request.auth.id != "" && (user = @request.auth.id || (${HR_OR_OWNER}))`,
    createRule: `@request.auth.id != "" && user = @request.auth.id && status = "pending"`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    deleteRule: null,
  };

  await ensureCollection(token, "hr_payroll_bank_accounts", [
    relationField("user", usersId, true),
    textField("bank_name", true),
    textField("account_number", true),
    textField("account_holder_name", true),
    selectField("status", ["active", "pending", "inactive", "rejected"], true),
    textField("note"),
    textField("evidence_document_id"),
    dateField("effective_at"),
    relationField("approved_by", usersId, false),
    dateField("approved_at"),
    relationField("rejected_by", usersId, false),
    dateField("rejected_at"),
    textField("rejection_reason"),
  ], bankRules);

  const itemsCol = await pbJson("GET", "/api/collections/payroll_items", null, token);
  if (!itemsCol.ok) throw new Error("payroll_items missing");
  const { schema: itemSchema } = ensureFields(itemsCol.data.schema, [
    textField("bank_name_snapshot"),
    textField("bank_account_number_snapshot"),
    textField("bank_account_holder_snapshot"),
    textField("bank_account_id_snapshot"),
    textField("company_logo_snapshot"),
  ]);
  await patchCollection(token, "payroll_items", { schema: itemSchema });

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const { schema: companySchema } = ensureFields(companyCol.data.schema, [fileField("logo")]);
  await patchCollection(token, "biz_company_profile", { schema: companySchema });

  console.log("Phase 34F refinement schema OK.");
}

main().catch((e) => { console.error(e); process.exit(1); });
