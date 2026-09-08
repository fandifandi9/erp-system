/**
 * Tambah field share_token ke dokumen bisnis (invoice, PO, SO) untuk link publik aman.
 * Run: npm run pb:share-token-schema
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

const shareTokenField = {
  system: false,
  id: fieldId("shrtok"),
  name: "share_token",
  type: "text",
  required: false,
  presentable: false,
  unique: true,
  options: { min: 0, max: 64, pattern: "" },
};

async function ensureShareToken(collectionName) {
  const colRes = await fetch(`${url}/api/collections/${collectionName}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.error(`Collection ${collectionName} tidak ditemukan`, col);
    process.exit(1);
  }

  const schema = [...(col.schema ?? col.fields ?? [])];
  if (schema.find((f) => f.name === "share_token")) {
    console.log(`${collectionName}: share_token sudah ada.`);
    return;
  }

  schema.push({ ...shareTokenField, id: fieldId("shrtok") });

  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  const patchBody = await patchRes.json();
  if (!patchRes.ok) {
    console.error(`PATCH ${collectionName} failed`, patchRes.status, patchBody);
    process.exit(1);
  }
  console.log(`${collectionName}: share_token ditambahkan.`);
}

for (const name of ["biz_invoices", "biz_purchase_orders", "biz_sales_orders"]) {
  await ensureShareToken(name);
}

console.log("Selesai — share_token siap untuk invoice, PO, dan SO.");
