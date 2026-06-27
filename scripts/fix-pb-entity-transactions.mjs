// Fase 1 multi-entitas: field company di transaksi + backfill dari store/gudang/invoice.
// Jalankan: node scripts/fix-pb-entity-transactions.mjs
import PocketBase from "pocketbase";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const url = env.NEXT_PUBLIC_POCKETBASE_URL.replace(/\/$/, "");
const pb = new PocketBase(url);
pb.autoCancellation(false);
const res = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
});
const auth = await res.json();
if (!auth.token) {
  console.log("ADMIN AUTH GAGAL:", JSON.stringify(auth));
  process.exit(1);
}
pb.authStore.save(auth.token, auth.admin ?? {});
console.log("Admin auth OK");

async function patchCollection(name, addFields) {
  const col = await pb.collections.getOne(name);
  const list = col.fields ?? col.schema ?? [];
  let changed = false;
  for (const field of addFields) {
    if (list.some((f) => f.name === field.name)) {
      console.log(`  OK: ${name}.${field.name} sudah ada`);
      continue;
    }
    list.push(field);
    changed = true;
    console.log(`  + ${name}.${field.name}`);
  }
  if (changed) {
    const payload = col.fields ? { fields: list } : { schema: list };
    await pb.collections.update(col.id, payload);
  }
}

const companyColId = (await pb.collections.getOne("biz_company_profile")).id;
const rel = (name, collectionId, required = false) => ({
  name,
  type: "relation",
  required,
  options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
});

const txCollections = [
  "biz_sales_orders",
  "biz_invoices",
  "biz_purchase_orders",
  "biz_purchase_bills",
  "biz_payments",
  "biz_bill_payments",
  "biz_expenses",
  "biz_credit_notes",
];

for (const col of txCollections) {
  await patchCollection(col, [rel("company", companyColId)]);
}

// ── Cache master ──
const companies = await pb.collection("biz_company_profile").getFullList({ sort: "created", requestKey: null });
const defaultCompanyId = companies[0]?.id ?? null;
if (!defaultCompanyId) {
  console.log("!! Tidak ada entitas — buat biz_company_profile dulu.");
  process.exit(1);
}
console.log("Entitas default backfill:", companies[0].company_name);

const storeMap = Object.fromEntries(
  (await pb.collection("biz_stores").getFullList({ requestKey: null })).map((s) => [s.id, s.company || defaultCompanyId]),
);
const whMap = Object.fromEntries(
  (await pb.collection("inv_warehouses").getFullList({ requestKey: null })).map((w) => [w.id, w.company || defaultCompanyId]),
);
const cashMap = Object.fromEntries(
  (await pb.collection("biz_cash_accounts").getFullList({ requestKey: null })).map((c) => [c.id, c.company || defaultCompanyId]),
);
const soMap = {};
const invMap = {};
const poMap = {};
const billMap = {};

function snapCompany(raw) {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw);
    return j.company_id || null;
  } catch {
    return null;
  }
}

async function backfill(col, resolver) {
  const rows = await pb.collection(col).getFullList({ requestKey: null });
  let n = 0;
  for (const r of rows) {
    if (r.company) {
      if (col === "biz_sales_orders") soMap[r.id] = r.company;
      if (col === "biz_invoices") invMap[r.id] = r.company;
      if (col === "biz_purchase_orders") poMap[r.id] = r.company;
      if (col === "biz_purchase_bills") billMap[r.id] = r.company;
      continue;
    }
    const cid = (await resolver(r)) || defaultCompanyId;
    await pb.collection(col).update(r.id, { company: cid });
    if (col === "biz_sales_orders") soMap[r.id] = cid;
    if (col === "biz_invoices") invMap[r.id] = cid;
    if (col === "biz_purchase_orders") poMap[r.id] = cid;
    if (col === "biz_purchase_bills") billMap[r.id] = cid;
    n++;
  }
  console.log(`Backfill ${col}: ${n} record`);
}

await backfill("biz_sales_orders", async (r) => {
  if (r.warehouse && whMap[r.warehouse]) return whMap[r.warehouse];
  if (r.store && storeMap[r.store]) return storeMap[r.store];
  return defaultCompanyId;
});

await backfill("biz_invoices", async (r) => {
  if (r.store && storeMap[r.store]) return storeMap[r.store];
  const snap = snapCompany(r.identity_snapshot_json);
  if (snap) return snap;
  if (r.sales_order && soMap[r.sales_order]) return soMap[r.sales_order];
  return defaultCompanyId;
});

await backfill("biz_purchase_orders", async (r) => {
  if (r.warehouse && whMap[r.warehouse]) return whMap[r.warehouse];
  return defaultCompanyId;
});

await backfill("biz_purchase_bills", async (r) => {
  if (r.purchase_order && poMap[r.purchase_order]) return poMap[r.purchase_order];
  return defaultCompanyId;
});

await backfill("biz_payments", async (r) => {
  if (r.invoice && invMap[r.invoice]) return invMap[r.invoice];
  if (r.cash_account && cashMap[r.cash_account]) return cashMap[r.cash_account];
  return defaultCompanyId;
});

await backfill("biz_bill_payments", async (r) => {
  if (r.purchase_bill && billMap[r.purchase_bill]) return billMap[r.purchase_bill];
  if (r.cash_account && cashMap[r.cash_account]) return cashMap[r.cash_account];
  return defaultCompanyId;
});

await backfill("biz_expenses", async (r) => {
  if (r.store && storeMap[r.store]) return storeMap[r.store];
  return defaultCompanyId;
});

await backfill("biz_credit_notes", async (r) => {
  if (r.invoice && invMap[r.invoice]) return invMap[r.invoice];
  if (r.sales_order && soMap[r.sales_order]) return soMap[r.sales_order];
  return defaultCompanyId;
});

console.log("Selesai — entity_id (company) di semua transaksi.");
