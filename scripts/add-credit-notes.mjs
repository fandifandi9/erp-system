// Setup akuntansi akrual:
// 1. Collection baru biz_credit_notes (nota kredit / Retur Penjualan — contra revenue).
// 2. Field fee_amount di biz_payments (Pendapatan Lain-lain saat pelunasan).
// Jalankan: node scripts/add-credit-notes.mjs
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

async function colId(name) {
  return (await pb.collections.getOne(name)).id;
}

const [retursId, invoicesId, sosId, usersId] = await Promise.all([
  colId("biz_returs"),
  colId("biz_invoices"),
  colId("biz_sales_orders"),
  colId("users"),
]);

const rel = (name, collectionId) => ({
  name,
  type: "relation",
  required: false,
  options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
});
const num = (name) => ({ name, type: "number", required: false, options: { min: null, max: null } });
const text = (name, required = false) => ({ name, type: "text", required, options: {} });

// 1. biz_credit_notes
let exists = true;
try {
  await pb.collections.getOne("biz_credit_notes");
} catch {
  exists = false;
}
if (exists) {
  console.log("OK: biz_credit_notes sudah ada");
} else {
  const authRule = '@request.auth.id != ""';
  await pb.collections.create({
    name: "biz_credit_notes",
    type: "base",
    schema: [
      text("cn_no", true),
      rel("retur", retursId),
      rel("invoice", invoicesId),
      rel("sales_order", sosId),
      { name: "cn_date", type: "date", required: true, options: {} },
      num("amount"),
      num("applied_to_receivable"),
      num("refunded"),
      {
        name: "status",
        type: "select",
        required: true,
        options: { maxSelect: 1, values: ["issued", "cancelled"] },
      },
      text("reason"),
      text("notes"),
      rel("created_by", usersId),
    ],
    listRule: authRule,
    viewRule: authRule,
    createRule: authRule,
    updateRule: authRule,
    deleteRule: null,
  });
  console.log("OK: biz_credit_notes dibuat");
}

// 2. fee_amount di biz_payments
const payCol = await pb.collections.getOne("biz_payments");
const payFields = payCol.fields ?? payCol.schema ?? [];
if (payFields.some((f) => f.name === "fee_amount")) {
  console.log("OK: biz_payments sudah punya fee_amount");
} else {
  payFields.push(num("fee_amount"));
  const payload = payCol.fields ? { fields: payFields } : { schema: payFields };
  await pb.collections.update(payCol.id, payload);
  console.log("OK: fee_amount ditambahkan ke biz_payments");
}

console.log("Selesai.");
