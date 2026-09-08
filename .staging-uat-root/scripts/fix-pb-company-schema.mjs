/**
 * Profil perusahaan + rekonsiliasi kas.
 * Run: npm run pb:company-schema
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const get = (k) => {
      const m = text.match(new RegExp(`^${k}=(.+)$`, "m"));
      if (!m) return "";
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    };
    return {
      url: get("NEXT_PUBLIC_POCKETBASE_URL"),
      email: get("POCKETBASE_ADMIN_EMAIL"),
      pass: get("POCKETBASE_ADMIN_PASSWORD"),
    };
  }
  throw new Error("No .env.local or .env");
}

const { url, email, pass } = loadEnv();

const authRes = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("Auth failed", auth);
  process.exit(1);
}

const headers = { Authorization: auth.token, "Content-Type": "application/json" };

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan — jalankan pb:cash-schema dulu jika perlu akun kas`);
  return col.id;
}

function textField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "text",
    required,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  };
}

function numberField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "number",
    required,
    presentable: false,
    unique: false,
    options: { min: null, max: null, noDecimal: false },
  };
}

function dateField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "date",
    required,
    presentable: false,
    unique: false,
    options: { min: "", max: "" },
  };
}

function relationField(name, collectionId, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

async function ensureCollection(name, schema) {
  const existingRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const existing = await existingRes.json();
  if (existing.id) {
    console.log(`Collection ${name} sudah ada.`);
    return existing.id;
  }
  const createRes = await fetch(`${url}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      schema,
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Create failed", created);
    process.exit(1);
  }
  console.log(`Collection ${name} dibuat.`);
  return created.id;
}

await ensureCollection("biz_company_profile", [
  textField("company_name", "cpnm", true),
  textField("legal_name", "cplg", false),
  textField("npwp", "cpnp", false),
  textField("address", "cpad", false),
  textField("city", "cpct", false),
  textField("phone", "cpph", false),
  textField("email", "cpem", false),
  textField("website", "cpwb", false),
]);

let accountsId;
try {
  accountsId = await getCollectionId("biz_cash_accounts");
} catch {
  console.log("biz_cash_accounts belum ada — skip rekonsiliasi (jalankan npm run pb:cash-schema)");
}

if (accountsId) {
  const usersId = await getCollectionId("users");
  await ensureCollection("biz_cash_reconciliations", [
    relationField("cash_account", accountsId, "rcacc", true),
    dateField("statement_date", "rcdt", true),
    numberField("statement_balance", "rcsb", true),
    numberField("book_balance", "rcbb", true),
    numberField("difference", "rcdf", true),
    textField("notes", "rcnt", false),
    relationField("created_by", usersId, "rcby", true),
  ]);
}

console.log("Selesai — schema perusahaan & rekonsiliasi siap.");
