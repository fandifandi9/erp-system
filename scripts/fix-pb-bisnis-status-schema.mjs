/**
 * Pastikan opsi Select `status` di invoice/SO/PO/bill sesuai aplikasi.
 * Run: node scripts/fix-pb-bisnis-status-schema.mjs
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

function splitCombinedSelectValue(values) {
  if (!values?.length) return null;
  if (values.length > 1) return null;
  const one = values[0];
  if (!one.includes("·") && !one.includes(",") && !one.includes("|")) return null;
  return one.split(/[·,|]/).map((s) => s.trim()).filter(Boolean);
}

function mergeSelectValues(current, required) {
  const combined = splitCombinedSelectValue(current);
  const base = combined ?? (current?.length ? [...current] : []);
  const merged = [...base];
  for (const v of required) {
    if (!merged.includes(v)) merged.push(v);
  }
  const same =
    merged.length === (combined ?? current ?? []).length &&
    required.every((v) => (combined ?? current ?? []).includes(v));
  return { merged, changed: !same || !!combined };
}

const TARGETS = [
  {
    collection: "biz_invoices",
    field: "status",
    values: ["unpaid", "paid", "overdue", "cancelled", "draft", "sent"],
  },
  {
    collection: "biz_sales_orders",
    field: "status",
    values: ["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"],
  },
  {
    collection: "biz_sales_orders",
    field: "payment_status",
    values: ["unpaid", "partial", "paid", "refunded"],
  },
  {
    collection: "biz_sales_orders",
    field: "payment_method",
    values: [
      "cash",
      "bank_transfer",
      "credit_card",
      "debit_card",
      "e_wallet",
      "cod",
      "other",
    ],
  },
  {
    collection: "biz_purchase_orders",
    field: "status",
    values: ["draft", "sent", "confirmed", "partial_received", "received", "cancelled"],
  },
  {
    collection: "biz_purchase_bills",
    field: "status",
    values: ["draft", "unpaid", "received", "paid", "overdue", "cancelled"],
  },
];

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

let anyChanged = false;

for (const target of TARGETS) {
  const colRes = await fetch(`${url}/api/collections/${target.collection}`, { headers });
  const col = await colRes.json();
  if (!col.id) {
    console.warn(`SKIP ${target.collection}: tidak ditemukan`);
    continue;
  }

  const schema = [...(col.schema ?? col.fields ?? [])];
  const idx = schema.findIndex((f) => f.name === target.field && f.type === "select");
  if (idx < 0) {
    console.warn(`SKIP ${target.collection}.${target.field}: field select tidak ada`);
    continue;
  }

  const field = schema[idx];
  const current = field.options?.values ?? [];
  const { merged, changed } = mergeSelectValues(current, target.values);

  if (!changed) {
    console.log(`OK ${target.collection}.${target.field}:`, current);
    continue;
  }

  console.log(`FIX ${target.collection}.${target.field}:`, current, "->", merged);
  schema[idx] = {
    ...field,
    options: { ...(field.options ?? {}), maxSelect: field.options?.maxSelect ?? 1, values: merged },
  };
  anyChanged = true;

  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  const patchBody = await patchRes.json();
  if (!patchRes.ok) {
    console.error(`PATCH ${target.collection} failed`, patchRes.status, patchBody);
    process.exit(1);
  }
  const saved = (patchBody.schema ?? patchBody.fields ?? []).find(
    (f) => f.name === target.field,
  );
  console.log(`  updated:`, saved?.options?.values ?? merged);
}

if (!anyChanged) {
  console.log("Semua status select sudah benar.");
} else {
  console.log("Selesai. Coba lagi Buat Invoice dari SO.");
}
