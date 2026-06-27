/**
 * Akun kas & bank terpusat + transfer antar akun.
 * Run: npm run pb:cash-schema
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

const headers = {
  Authorization: auth.token,
  "Content-Type": "application/json",
};

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan`);
  return col.id;
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

function selectField(name, idPrefix, values, required = true) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "select",
    required,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values },
  };
}

function boolField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  };
}

async function ensureCollection(name, schema) {
  const existingRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const existing = await existingRes.json();
  if (existing.id) {
    console.log(`Collection ${name} sudah ada.`);
    return existing.id;
  }
  console.log(`CREATE ${name}`);
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

const storesId = await getCollectionId("biz_stores");
const usersId = await getCollectionId("users");

const accountsId = await ensureCollection("biz_cash_accounts", [
  textField("code", "cshcd", true),
  textField("name", "cshnm", true),
  selectField("account_type", "cshtp", ["bank", "cash", "ewallet"]),
  relationField("store", storesId, "cshst", false),
  textField("bank_name", "cshbn", false),
  textField("bank_account_name", "cshan", false),
  textField("bank_account_number", "cshno", false),
  numberField("opening_balance", "cshob", false),
  boolField("is_active", "cshac"),
  textField("notes", "cshnt", false),
]);

await ensureCollection("biz_cash_transfers", [
  textField("transfer_no", "trfno", true),
  relationField("from_account", accountsId, "trffr", true),
  relationField("to_account", accountsId, "trfto", true),
  numberField("amount", "tramt", true),
  dateField("transfer_date", "trfdt", true),
  textField("notes", "trfnt", false),
  relationField("created_by", usersId, "trfby", true),
]);

console.log("Selesai — schema kas & bank siap.");
