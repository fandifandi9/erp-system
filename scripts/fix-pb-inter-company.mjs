/**
 * Fase 6: kas pusat (is_central) + transfer inter-company.
 * Run: npm run pb:inter-company
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
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan`);
  return col.id;
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

function selectField(name, idPrefix, values) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values },
  };
}

function relationField(name, collectionId, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required: false,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

async function patchCollection(name, fields) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.error(`Collection ${name} tidak ditemukan`);
    process.exit(1);
  }
  const schema = [...(col.schema ?? col.fields ?? [])];
  let changed = false;
  for (const f of fields) {
    if (schema.some((x) => x.name === f.name)) {
      console.log(`  OK: ${name}.${f.name}`);
      continue;
    }
    schema.push(f);
    changed = true;
    console.log(`  + ${name}.${f.name}`);
  }
  if (!changed) {
    console.log(`Schema ${name} sudah benar.`);
    return;
  }
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  if (!patchRes.ok) {
    console.error(`PATCH ${name} failed`, await patchRes.json());
    process.exit(1);
  }
  console.log(`Schema ${name} updated.`);
}

const companyId = await getCollectionId("biz_company_profile");

await patchCollection("biz_cash_accounts", [boolField("is_central", "cshct")]);

await patchCollection("biz_cash_transfers", [
  selectField("transfer_kind", "trfkd", ["internal", "inter_company"]),
  relationField("from_company", companyId, "trffc"),
  relationField("to_company", companyId, "trftc"),
  relationField("initiated_company", companyId, "trfic"),
]);

console.log("Selesai — schema kas pusat & inter-company siap.");
