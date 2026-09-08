/**
 * Katalog Produk — lifecycle & product_type pada inv_products.
 * Run: npm run pb:catalog-schema
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
  if (field.type === "select" && field.options?.values) {
    const required = field.options.values;
    const cur = current.options?.values ?? [];
    const merged = [...cur];
    let changed = false;
    for (const v of required) {
      if (!merged.includes(v)) {
        merged.push(v);
        changed = true;
      }
    }
    if (changed) {
      schema[idx] = { ...current, options: { ...(current.options ?? {}), maxSelect: 1, values: merged } };
      return true;
    }
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
    console.log(`Schema ${name} (katalog) sudah benar.`);
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

const selectField = (name, idPrefix, values) => ({
  system: false,
  id: fieldId(idPrefix),
  name,
  type: "select",
  required: false,
  presentable: false,
  unique: false,
  options: { maxSelect: 1, values },
});

const textField = (name, idPrefix) => ({
  system: false,
  id: fieldId(idPrefix),
  name,
  type: "text",
  required: false,
  presentable: false,
  unique: false,
  options: { min: null, max: null, pattern: "" },
});

const fileField = (name, idPrefix) => ({
  system: false,
  id: fieldId(idPrefix),
  name,
  type: "file",
  required: false,
  presentable: false,
  unique: false,
  options: {
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/webp", "image/jpeg", "image/png", "image/gif"],
    thumbs: ["100x100", "200x200", "400x400"],
  },
});

await patchCollection("inv_products", [
  selectField("product_type", "ptype", ["simple", "bundle"]),
  selectField("lifecycle_status", "lfcyc", ["draft", "active", "inactive"]),
  textField("commercial_ready_at", "cmrdy"),
  textField("commercial_ready_by", "cmrby"),
  textField("created_by_role", "cbrl"),
  textField("catalog_updated_at", "catupd"),
  fileField("image_2", "img2"),
  fileField("image_3", "img3"),
]);

console.log("Backfill lifecycle_status dari is_active…");

let page = 1;
let backfilled = 0;
while (true) {
  const listRes = await fetch(
    `${url}/api/collections/inv_products/records?page=${page}&perPage=100`,
    { headers },
  );
  const list = await listRes.json();
  if (!list.items?.length) break;

  for (const row of list.items) {
    const patch = {};
    if (!row.product_type) patch.product_type = "simple";
    if (!row.lifecycle_status) {
      patch.lifecycle_status = row.is_active === false ? "inactive" : "active";
    }
    if (Object.keys(patch).length === 0) continue;
    const pr = await fetch(`${url}/api/collections/inv_products/records/${row.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    if (pr.ok) backfilled++;
  }

  if (page >= (list.totalPages ?? 1)) break;
  page++;
}

console.log(`Backfill selesai — ${backfilled} produk diperbarui.`);
console.log("Selesai — schema Katalog Produk siap.");
