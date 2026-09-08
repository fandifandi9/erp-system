/**
 * Field retur penjualan: link SO/invoice, kondisi barang, kompensasi MP, ongkir.
 * Run: npm run pb:retur-schema
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
    console.log(`Schema ${name} (retur) sudah benar.`);
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

const returFields = [
  {
    system: false,
    id: fieldId("rtsord"),
    name: "sales_order",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtinv"),
    name: "invoice",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtdmgw"),
    name: "damaged_warehouse",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtmpcl"),
    name: "mp_claim_amount",
    type: "number",
    required: false,
    presentable: false,
    unique: false,
    options: { min: 0, max: null, noDecimal: false },
  },
  {
    system: false,
    id: fieldId("rtshrb"),
    name: "shipping_reimb_amount",
    type: "number",
    required: false,
    presentable: false,
    unique: false,
    options: { min: 0, max: null, noDecimal: false },
  },
  {
    system: false,
    id: fieldId("rtcmp"),
    name: "completed_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("rtnote"),
    name: "notes",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
];

const lineFields = [
  {
    system: false,
    id: fieldId("rtlcd"),
    name: "condition",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["good", "damaged"] },
  },
  {
    system: false,
    id: fieldId("rtlsol"),
    name: "sales_order_line",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
];

const returFieldsP2 = [
  {
    system: false,
    id: fieldId("rtpo"),
    name: "purchase_order",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtbill"),
    name: "purchase_bill",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtwms"),
    name: "wms_receive_status",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["pending", "checking", "complete"] },
  },
  {
    system: false,
    id: fieldId("rtwmsa"),
    name: "wms_received_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("rtwf"),
    name: "workflow_phase",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      values: ["awaiting_wms", "wms_received", "awaiting_business", "awaiting_settlement", "completed", "cancelled"],
    },
  },
  {
    system: false,
    id: fieldId("rtuvp"),
    name: "unboxing_video_path",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtrmd"),
    name: "reminder_due_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("rtexc"),
    name: "exception_status",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["none", "open", "resolved"] },
  },
  {
    system: false,
    id: fieldId("rtstk"),
    name: "stock_posted_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("rtstl"),
    name: "settled_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("rtstj"),
    name: "settlement_estimate_json",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: 20000, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtwmex"),
    name: "wms_exception_summary",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: 5000, pattern: "" },
  },
];

const lineFieldsP2 = [
  {
    system: false,
    id: fieldId("rtlpol"),
    name: "purchase_order_line",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtlexc"),
    name: "expected_condition",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["good", "damaged"] },
  },
  {
    system: false,
    id: fieldId("rtlexw"),
    name: "expected_warehouse",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("rtlacq"),
    name: "actual_qty",
    type: "number",
    required: false,
    presentable: false,
    unique: false,
    options: { min: 0, max: null, noDecimal: false },
  },
  {
    system: false,
    id: fieldId("rtlacc"),
    name: "actual_condition",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["good", "damaged"] },
  },
];

const paymentFields = [
  {
    system: false,
    id: fieldId("payknd"),
    name: "payment_kind",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["payment", "refund"] },
  },
];

await patchCollection("biz_returs", [...returFields, ...returFieldsP2]);
await patchCollection("biz_retur_lines", [...lineFields, ...lineFieldsP2]);
await patchCollection("biz_payments", paymentFields);

const poReceivingFields = [
  {
    system: false,
    id: fieldId("porbs"),
    name: "receiving_business_status",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      values: ["pending_wms", "awaiting_business", "resolved"],
    },
  },
  {
    system: false,
    id: fieldId("pordsc"),
    name: "receiving_discrepancy",
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("pouvp"),
    name: "unboxing_video_path",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    system: false,
    id: fieldId("pormd"),
    name: "reminder_due_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("poexc"),
    name: "exception_status",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values: ["none", "open", "resolved"] },
  },
  {
    system: false,
    id: fieldId("poauto"),
    name: "receiving_auto_proceeded_at",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  },
  {
    system: false,
    id: fieldId("poqcs"),
    name: "qc_exception_summary",
    type: "text",
    required: false,
    presentable: false,
    unique: false,
    options: { min: null, max: 5000, pattern: "" },
  },
];

await patchCollection("biz_purchase_orders", poReceivingFields);

console.log("Selesai. Jalankan ulang dev server jika perlu.");
