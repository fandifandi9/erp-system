/**
 * LOCAL-ONLY Phase 34G: effective-dated bank accounts + entity identity fields.
 * Run: npm run migrate:local-hr-phase34g
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
function relationField(name, collectionId, required = false) {
  return {
    name, type: "relation", required, system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
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

async function backfillBankEffectiveDates(token) {
  const list = await pbJson("GET", "/api/collections/hr_payroll_bank_accounts/records?perPage=500", null, token);
  if (!list.ok) return;
  for (const rec of list.data.items || []) {
    const patch = {};
    if (!rec.effective_from && rec.effective_at) patch.effective_from = rec.effective_at;
    if (!rec.effective_from && rec.status === "active" && !rec.effective_at) {
      patch.effective_from = String(rec.approved_at || rec.created || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    }
    if (Object.keys(patch).length === 0) continue;
    await pbJson("PATCH", `/api/collections/hr_payroll_bank_accounts/records/${rec.id}`, patch, token);
    console.log(`  backfill bank ${rec.id}`);
  }
}

async function main() {
  console.log("Phase 34G migration — effective-dated bank + entity identity");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;
  const usersId = (await pbJson("GET", "/api/collections/users", null, token)).data.id;

  const bankCol = await pbJson("GET", "/api/collections/hr_payroll_bank_accounts", null, token);
  if (!bankCol.ok) throw new Error("hr_payroll_bank_accounts missing — run migrate:local-hr-phase34f-refinement first");
  const { schema: bankSchema, changed: bankChanged } = ensureFields(bankCol.data.schema, [
    dateField("effective_from"),
    dateField("effective_until"),
    relationField("created_by", usersId, false),
    relationField("updated_by", usersId, false),
  ]);
  if (bankChanged) await patchCollection(token, "hr_payroll_bank_accounts", { schema: bankSchema });

  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const { schema: companySchema, changed: companyChanged } = ensureFields(companyCol.data.schema, [
    textField("display_name"),
    textField("npwp"),
    textField("address"),
    textField("city"),
    textField("phone"),
    textField("email"),
    textField("website"),
    relationField("updated_by", usersId, false),
  ]);
  if (companyChanged) await patchCollection(token, "biz_company_profile", { schema: companySchema });

  const itemsCol = await pbJson("GET", "/api/collections/payroll_items", null, token);
  if (itemsCol.ok) {
    const { schema: itemSchema, changed: itemChanged } = ensureFields(itemsCol.data.schema, [
      textField("company_legal_name_snapshot"),
    ]);
    if (itemChanged) await patchCollection(token, "payroll_items", { schema: itemSchema });
  }

  await backfillBankEffectiveDates(token);
  console.log("Phase 34G schema OK.");
}

main().catch((e) => { console.error(e); process.exit(1); });
