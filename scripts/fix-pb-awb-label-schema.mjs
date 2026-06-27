/**
 * Field label AWB (PDF/gambar) pada biz_sales_orders.
 * Run: node scripts/fix-pb-awb-label-schema.mjs
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

const AWB_SOURCE_VALUES = ["manual", "excel", "zip_import", "wms_pickup"];

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }
  const current = schema[idx];
  if (current.type !== field.type) {
    console.warn(`SKIP ${field.name}: sudah ada sebagai ${current.type}`);
    return false;
  }
  if (field.type === "select") {
    const cur = current.options?.values ?? [];
    const same =
      cur.length === AWB_SOURCE_VALUES.length && AWB_SOURCE_VALUES.every((v) => cur.includes(v));
    if (!same) {
      schema[idx] = {
        ...current,
        options: { ...(current.options ?? {}), maxSelect: 1, values: AWB_SOURCE_VALUES },
      };
      return true;
    }
  }
  return false;
}

const fields = [
  {
    system: false,
    id: fieldId("awblbl"),
    name: "awb_label",
    type: "file",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      maxSize: 8388608,
      mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
      thumbs: [],
    },
  },
  {
    system: false,
    id: fieldId("awbrdy"),
    name: "awb_ready_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("awbsrc"),
    name: "awb_source",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: AWB_SOURCE_VALUES },
  },
];

const colRes = await fetch(`${url}/api/collections/biz_sales_orders`, { headers });
const col = await colRes.json();
if (!col.id) {
  console.error("Collection biz_sales_orders tidak ditemukan", col);
  process.exit(1);
}

const schema = [...(col.schema ?? col.fields ?? [])];
let changed = false;
for (const f of fields) {
  if (ensureField(schema, f)) changed = true;
}

if (!changed) {
  console.log("Schema biz_sales_orders (AWB) sudah benar.");
  process.exit(0);
}

const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ schema }),
});
const patchBody = await patchRes.json();
if (!patchRes.ok) {
  console.error("PATCH failed", patchRes.status, patchBody);
  process.exit(1);
}

console.log("Schema biz_sales_orders updated (AWB label).");
for (const f of fields) {
  const saved = (patchBody.schema ?? patchBody.fields ?? []).find((x) => x.name === f.name);
  if (saved) console.log(`  + ${saved.name} (${saved.type})`);
}
