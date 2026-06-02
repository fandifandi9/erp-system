/**
 * Tambah/perbaiki field WMS untuk SO + PO.
 * Run: node scripts/fix-pb-wms-orders-schema.mjs
 *
 * Catatan: send_to_warehouse_at / warehouse_processed_at disimpan sebagai text ISO
 * (sama seperti pocketbase_migration.json & lib/bisnis/purchase-warehouse.ts).
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

const WMS_STATUS_VALUES = ["pending", "checking", "hold", "processing", "complete"];

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

async function resolveUsersCollectionId() {
  for (const name of ["users", "_pb_users_auth_"]) {
    const res = await fetch(`${url}/api/collections/${name}`, { headers });
    const col = await res.json();
    if (col.id) return col.id;
  }
  console.warn("Collection users tidak ditemukan — lewati warehouse_processed_by");
  return null;
}

function fixSelectValues(field) {
  const current = field.options?.values ?? [];
  const same =
    current.length === WMS_STATUS_VALUES.length &&
    WMS_STATUS_VALUES.every((v) => current.includes(v));
  if (same) return null;
  return {
    ...field,
    options: { ...(field.options ?? {}), maxSelect: field.options?.maxSelect ?? 1, values: WMS_STATUS_VALUES },
  };
}

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }

  const current = schema[idx];
  if (current.type !== field.type) {
    console.warn(
      `SKIP ${field.name}: sudah ada sebagai ${current.type}, tidak diubah ke ${field.type}`,
    );
    if (field.type === "select" && current.type === "select") {
      const fixed = fixSelectValues(current);
      if (fixed) {
        schema[idx] = fixed;
        return true;
      }
    }
    return false;
  }

  if (field.type === "select") {
    const fixed = fixSelectValues(current);
    if (fixed) {
      schema[idx] = fixed;
      return true;
    }
  }

  return false;
}

function textField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  };
}

function buildCommonWmsFields(usersCollectionId) {
  const fields = [
    textField("send_to_warehouse_at", "sendwh"),
    {
      system: false,
      id: fieldId("whst"),
      name: "warehouse_process_status",
      type: "select",
      required: false,
      presentable: false,
      unique: false,
      options: { maxSelect: 1, values: WMS_STATUS_VALUES },
    },
  ];

  if (usersCollectionId) {
    fields.push({
      system: false,
      id: fieldId("whproc"),
      name: "warehouse_processed_by",
      type: "relation",
      required: false,
      presentable: false,
      unique: false,
      options: {
        collectionId: usersCollectionId,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
        displayFields: null,
      },
    });
  }

  fields.push(textField("warehouse_processed_at", "whprocat"));
  return fields;
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
  for (const f of fields) {
    const saved = (patchBody.schema ?? patchBody.fields ?? []).find((x) => x.name === f.name);
    if (saved) console.log(`  + ${saved.name} (${saved.type})`);
  }
}

const usersCollectionId = await resolveUsersCollectionId();
const commonWmsFields = buildCommonWmsFields(usersCollectionId);

await patchCollection("biz_sales_orders", [
  ...commonWmsFields,
  textField("warehouse_hold_note", "whholdso"),
  textField("outbound_workflow_json", "outwfso"),
  textField("wms_booking_no", "bkgso"),
]);

await patchCollection("biz_purchase_orders", commonWmsFields);

console.log("Selesai. Field WMS SO + PO siap dipakai.");
