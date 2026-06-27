/**
 * Single company + multi-store: branding, work context, activity feed, audit log.
 * Run: npm run pb:tenant-schema
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

function selectField(name, idPrefix, values, required = false) {
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

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }
  if (schema[idx].type !== field.type) {
    console.warn(`SKIP ${field.name}: type mismatch`);
    return false;
  }
  return false;
}

function ensureSelectValues(schema, name, extraValues) {
  const idx = schema.findIndex((f) => f.name === name);
  if (idx < 0) return false;
  const f = schema[idx];
  if (f.type !== "select") return false;
  const cur = f.options?.values ?? [];
  const merged = [...new Set([...cur, ...extraValues])];
  if (merged.length === cur.length) return false;
  schema[idx] = {
    ...f,
    options: { ...f.options, values: merged, maxSelect: f.options?.maxSelect ?? 1 },
  };
  return true;
}

async function patchCollection(name, fields, selectValuePatches) {
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
  if (selectValuePatches) {
    for (const [fieldName, values] of selectValuePatches) {
      if (ensureSelectValues(schema, fieldName, values)) changed = true;
    }
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
  const patchBody = await patchRes.json();
  if (!patchRes.ok) {
    console.error(`PATCH ${name} failed`, patchRes.status, patchBody);
    process.exit(1);
  }
  console.log(`Schema ${name} updated.`);
}

async function ensureCollection(name, schema) {
  const existingRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const existing = await existingRes.json();
  if (existing.id) {
    console.log(`Collection ${name} sudah ada — patch field.`);
    await patchCollection(name, schema);
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

const usersId = await getCollectionId("users");
const storesId = await getCollectionId("biz_stores");
const warehousesId = await getCollectionId("inv_warehouses");
let companyId;
try {
  companyId = await getCollectionId("biz_company_profile");
} catch {
  console.log("biz_company_profile belum ada — jalankan npm run pb:company-schema dulu");
  process.exit(1);
}

await patchCollection("biz_company_profile", [
  boolField("show_npwp_on_documents", "cpsnp"),
  selectField("npwp_display_mode", "cpnpm", ["footer", "header_secondary"], false),
]);

await patchCollection("biz_stores", [
  relationField("company", companyId, "stco", false),
  selectField("npwp_display", "stnpd", ["inherit", "show", "hide"], false),
]);

await patchCollection("inv_warehouses", [
  relationField("company", companyId, "whco", false),
  relationField("store", storesId, "whst", false),
]);

await patchCollection("biz_sales_orders", [
  relationField("store", storesId, "sost", false),
  selectField("business_channel", "sobc", ["b2c", "b2b"], false),
  selectField("sale_mode", "sosm", ["online", "offline"], false),
  textField("platform_source", "sops", false),
]);

await patchCollection("biz_invoices", [
  relationField("store", storesId, "invst", false),
  textField("identity_snapshot_json", "invsn", false),
  selectField("business_channel", "invbc", ["b2c", "b2b"], false),
  selectField("sale_mode", "invsm", ["online", "offline"], false),
  textField("platform_source", "invps", false),
]);

await patchCollection("biz_expenses", [relationField("store", storesId, "exst", false)], [
  ["category", ["marketplace"]],
]);

await patchCollection("users", [
  relationField("default_store", storesId, "udfst", false),
  relationField("default_warehouse", warehousesId, "udfwh", false),
  relationField("active_store", storesId, "uacst", false),
  relationField("active_warehouse", warehousesId, "uacwh", false),
  selectField("locale", "uloc", ["id", "en"], false),
]);

try {
  await patchCollection("biz_pos_registers", [
    relationField("default_store", storesId, "prdst", false),
    relationField("default_warehouse", warehousesId, "prdwh", false),
  ]);
} catch {
  console.log("biz_pos_registers skip");
}

const activitySchema = [
  textField("event_code", "evcd", true),
  selectField("severity", "evsv", ["info", "success", "warning"], true),
  selectField("module", "evmd", ["sales", "warehouse", "hr", "finance", "purchase", "settings"], true),
  textField("entity_type", "evet", false),
  textField("entity_id", "evei", false),
  textField("entity_label", "evel", false),
  relationField("actor", usersId, "evac", false),
  relationField("company", companyId, "evco", false),
  relationField("store", storesId, "evst", false),
  relationField("warehouse", warehousesId, "evwh", false),
  textField("payload_json", "evpj", false),
  textField("occurred_at", "evat", true),
  textField("dedupe_key", "evdk", false),
];

await ensureCollection("biz_activity_events", activitySchema);

const auditSchema = [
  textField("occurred_at", "auat", true),
  relationField("actor", usersId, "auac", false),
  textField("actor_ip", "auip", false),
  textField("actor_device", "audev", false),
  textField("module", "aumd", true),
  textField("action", "auacn", true),
  textField("entity_type", "auet", false),
  textField("entity_id", "auei", false),
  textField("entity_label", "auel", false),
  textField("summary", "ausm", false),
  textField("changes_json", "aucj", false),
  relationField("company", companyId, "auco", false),
  relationField("store", storesId, "aust", false),
  relationField("warehouse", warehousesId, "auwh", false),
  textField("request_id", "aurq", false),
];

await ensureCollection("sys_audit_log", auditSchema);

console.log("Selesai — schema tenant (multi-store, activity, audit) siap.");
