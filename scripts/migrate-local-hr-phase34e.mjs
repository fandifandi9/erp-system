/**
 * LOCAL-ONLY Phase 34E: payroll_items entity snapshot fields + hr_employee_documents collection.
 *
 * Run: npm run migrate:local-hr-phase34e
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
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
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
function fileField(name) {
  return {
    name,
    type: "file",
    required: false,
    system: false,
    options: { maxSelect: 1, maxSize: 10485760, mimeTypes: ["application/pdf", "image/jpeg", "image/png"] },
  };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  let changed = false;
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      changed = true;
      console.log(`  + payroll_items.${f.name}`);
    } else {
      console.log(`  OK: payroll_items.${f.name}`);
    }
  }
  return { schema: next, changed };
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

async function main() {
  console.log("Phase 34E local migration — payslip snapshot + employee documents");

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

  const itemsCol = await pbJson("GET", "/api/collections/payroll_items", null, token);
  if (!itemsCol.ok) throw new Error("payroll_items missing");

  const col = itemsCol.data;
  const snapshotFields = [
    relationField("company_id", companyCollectionId, false),
    textField("company_name_snapshot"),
    textField("company_code_snapshot"),
    textField("entity_type_snapshot"),
    textField("company_address_snapshot"),
    textField("company_npwp_snapshot"),
    textField("employee_code_snapshot"),
    textField("department_snapshot"),
    boolField("is_demo"),
    textField("demo_seed_key"),
  ];
  const { schema: nextSchema, changed } = ensureFields(col.schema ?? col.fields ?? [], snapshotFields);
  if (changed) {
    col.schema = nextSchema;
    const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
    if (!patch.ok) throw new Error(`PATCH payroll_items: ${JSON.stringify(patch.data).slice(0, 400)}`);
    console.log("payroll_items snapshot fields updated");
  }

  const periodsCol = await pbJson("GET", "/api/collections/payroll_periods", null, token);
  if (periodsCol.ok) {
    const pCol = periodsCol.data;
    const periodExtras = [boolField("is_demo"), textField("demo_seed_key")];
    let pSchema = [...(pCol.schema ?? pCol.fields ?? [])];
    const pNames = new Set(pSchema.map((f) => f.name));
    let pChanged = false;
    for (const f of periodExtras) {
      if (!pNames.has(f.name)) {
        pSchema.push(f);
        pChanged = true;
        console.log(`  + payroll_periods.${f.name}`);
      }
    }
    if (pChanged) {
      pCol.schema = pSchema;
      const patch = await pbJson("PATCH", `/api/collections/${pCol.id}`, pCol, token);
      if (!patch.ok) throw new Error(`PATCH payroll_periods: ${JSON.stringify(patch.data).slice(0, 400)}`);
    }
  }

  const docExisting = await pbJson("GET", "/api/collections/hr_employee_documents", null, token);
  const docRules = {
    listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
    viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
    createRule: `@request.auth.id != "" && user = @request.auth.id`,
    updateRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
    deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  };

  const docFields = [
    relationField("user", usersId, true),
    selectField("document_type", ["ktp", "npwp", "kk", "bank_account", "other"]),
    fileField("file"),
    textField("original_name"),
    textField("mime_type"),
    boolField("is_current"),
    relationField("replaced_document_id", "", false),
    dateField("replaced_at"),
    textField("uploaded_by"),
  ];

  if (docExisting.ok) {
    console.log("hr_employee_documents exists — updating rules/schema");
    const docCol = docExisting.data;
    let docSchema = [...(docCol.schema ?? docCol.fields ?? [])];
    const names = new Set(docSchema.map((f) => f.name));
    for (const f of docFields) {
      if (!names.has(f.name)) {
        if (f.name === "replaced_document_id" && !docCol.id) continue;
        if (f.name === "replaced_document_id") {
          docSchema.push(relationField("replaced_document_id", docCol.id, false));
        } else {
          docSchema.push(f);
        }
        console.log(`  + hr_employee_documents.${f.name}`);
      }
    }
    docCol.schema = docSchema;
    Object.assign(docCol, docRules);
    const patch = await pbJson("PATCH", `/api/collections/${docCol.id}`, docCol, token);
    if (!patch.ok) throw new Error(`PATCH hr_employee_documents: ${JSON.stringify(patch.data).slice(0, 400)}`);
  } else {
    const createBody = {
      name: "hr_employee_documents",
      type: "base",
      schema: docFields.filter((f) => f.name !== "replaced_document_id"),
      ...docRules,
    };
    const created = await pbJson("POST", "/api/collections", createBody, token);
    if (!created.ok) throw new Error(`CREATE hr_employee_documents: ${JSON.stringify(created.data).slice(0, 400)}`);
    const docId = created.data.id;
    console.log("hr_employee_documents created");

    const selfRef = relationField("replaced_document_id", docId, false);
    const col2 = await pbJson("GET", `/api/collections/${docId}`, null, token);
    col2.data.schema = [...(col2.data.schema ?? []), selfRef];
    await pbJson("PATCH", `/api/collections/${docId}`, col2.data, token);
  }

  // document verification status
  if (docExisting.ok || true) {
    const docColRes = await pbJson("GET", "/api/collections/hr_employee_documents", null, token);
    if (docColRes.ok) {
      const docCol = docColRes.data;
      let docSchema = [...(docCol.schema ?? docCol.fields ?? [])];
      const names = new Set(docSchema.map((f) => f.name));
      const statusField = selectField("verification_status", [
        "pending",
        "verified",
        "rejected",
        "needs_replacement",
      ]);
      if (!names.has("verification_status")) {
        docSchema.push(statusField);
        docCol.schema = docSchema;
        const patch = await pbJson("PATCH", `/api/collections/${docCol.id}`, docCol, token);
        if (!patch.ok) throw new Error(`PATCH hr_employee_documents.status: ${JSON.stringify(patch.data).slice(0, 300)}`);
        console.log("  + hr_employee_documents.verification_status");
      }
    }
  }

  // office_holidays — entity scope
  const holCol = await pbJson("GET", "/api/collections/office_holidays", null, token);
  if (holCol.ok) {
    const hCol = holCol.data;
    let hSchema = [...(hCol.schema ?? hCol.fields ?? [])];
    const hNames = new Set(hSchema.map((f) => f.name));
    let hChanged = false;
    for (const f of [
      relationField("company_id", companyCollectionId, false),
      selectField("holiday_type", ["national", "company", "collective_leave", "other"]),
      textField("description"),
      boolField("is_demo"),
      textField("demo_seed_key"),
    ]) {
      if (!hNames.has(f.name)) {
        hSchema.push(f);
        hChanged = true;
        console.log(`  + office_holidays.${f.name}`);
      }
    }
    if (hChanged) {
      hCol.schema = hSchema;
      await pbJson("PATCH", `/api/collections/${hCol.id}`, hCol, token);
    }
  }

  // hr_policies collection
  const policyExisting = await pbJson("GET", "/api/collections/hr_policies", null, token);
  const policyRules = {
    listRule: `@request.auth.id != "" && (status = "published" || ${HR_OR_OWNER_EXPR})`,
    viewRule: `@request.auth.id != "" && (status = "published" || ${HR_OR_OWNER_EXPR})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
  };
  const policyFields = [
    relationField("company_id", companyCollectionId, false),
    textField("title", true),
    selectField("category", [
      "kehadiran",
      "keterlambatan",
      "ketidakhadiran",
      "cuti",
      "lembur",
      "hari_libur",
      "penggajian",
      "potongan_gaji",
    ]),
    textField("content"),
    selectField("status", ["draft", "published", "archived"]),
    dateField("effective_from"),
    relationField("published_by", usersId, false),
    dateField("published_at"),
    relationField("created_by", usersId, false),
    relationField("updated_by", usersId, false),
    boolField("is_demo"),
    textField("demo_seed_key"),
  ];
  if (policyExisting.ok) {
    console.log("hr_policies exists — updating schema");
    const pCol = policyExisting.data;
    let pSchema = [...(pCol.schema ?? pCol.fields ?? [])];
    const pNames = new Set(pSchema.map((f) => f.name));
    for (const f of policyFields) {
      if (!pNames.has(f.name)) {
        pSchema.push(f);
        console.log(`  + hr_policies.${f.name}`);
      }
    }
    pCol.schema = pSchema;
    Object.assign(pCol, policyRules);
    await pbJson("PATCH", `/api/collections/${pCol.id}`, pCol, token);
  } else {
    const created = await pbJson(
      "POST",
      "/api/collections",
      { name: "hr_policies", type: "base", schema: policyFields, ...policyRules },
      token,
    );
    if (!created.ok) throw new Error(`CREATE hr_policies: ${JSON.stringify(created.data).slice(0, 400)}`);
    console.log("hr_policies created");
  }

  console.log("Phase 34E migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
