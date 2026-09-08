/**
 * Tier harga grosir — store + max_qty di inv_product_price_tiers.
 * Run: npm run pb:price-tiers-schema
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

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }
  return false;
}

async function patchCollection(name, fields) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.error(`Collection ${name} tidak ditemukan`, col);
    process.exit(1);
  }
  const schema = [...(col.schema ?? col.fields ?? [])];
  let changed = false;
  for (const f of fields) {
    if (ensureField(schema, f)) changed = true;
  }
  if (!changed) {
    console.log(`Schema ${name} (price tiers) sudah benar.`);
    return;
  }
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  const patchBody = await patchRes.json();
  if (!patchRes.ok) {
    console.error(`PATCH ${name} failed`, patchRes.status, patchBody);
    process.exit(1);
  }
  console.log(`Schema ${name} updated.`);
  for (const f of fields) {
    const saved = (patchBody.schema ?? patchBody.fields ?? []).find((x) => x.name === f.name);
    if (saved) console.log(`  + ${saved.name} (${saved.type})`);
  }
}

const storesId = await getCollectionId("biz_stores");

await patchCollection("inv_product_price_tiers", [
  {
    system: false,
    id: fieldId("ptstr"),
    name: "store",
    type: "relation",
    required: false,
    presentable: false,
    unique: false,
    options: {
      collectionId: storesId,
      cascadeDelete: false,
      minSelect: 0,
      maxSelect: 1,
      displayFields: [],
    },
  },
  {
    system: false,
    id: fieldId("ptmxq"),
    name: "max_qty",
    type: "number",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, noDecimal: true },
  },
]);

console.log("Selesai — schema tier harga grosir siap.");
