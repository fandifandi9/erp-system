// Backfill status "overdue" untuk bill & invoice belum lunas yang sudah lewat jatuh tempo.
// Jalankan: node scripts/backfill-overdue-status.mjs
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

const today = new Date();
today.setHours(0, 0, 0, 0);

function isPastDue(due) {
  if (!due) return false;
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function isCashDoc(rec, dateField) {
  if (rec.is_cash) return true;
  if (!rec[dateField] || !rec.due_date) return false;
  return String(rec[dateField]).slice(0, 10) === String(rec.due_date).slice(0, 10);
}

// Bills
const bills = await pb.collection("biz_purchase_bills").getFullList({ requestKey: null });
let nBill = 0;
for (const b of bills) {
  const unpaid = !["paid", "cancelled", "overdue"].includes(b.status);
  if (unpaid && !isCashDoc(b, "bill_date") && isPastDue(b.due_date)) {
    await pb.collection("biz_purchase_bills").update(b.id, { status: "overdue" });
    console.log(`BILL ${b.bill_no}: ${b.status} -> overdue (due ${String(b.due_date).slice(0, 10)})`);
    nBill++;
  }
}

// Invoices
const invoices = await pb.collection("biz_invoices").getFullList({ requestKey: null });
let nInv = 0;
for (const inv of invoices) {
  const unpaid = !["paid", "cancelled", "overdue"].includes(inv.status);
  if (unpaid && !isCashDoc(inv, "issue_date") && isPastDue(inv.due_date)) {
    await pb.collection("biz_invoices").update(inv.id, { status: "overdue" });
    console.log(`INV ${inv.invoice_no}: ${inv.status} -> overdue (due ${String(inv.due_date).slice(0, 10)})`);
    nInv++;
  }
}

console.log(`Selesai. Bill diupdate: ${nBill}, Invoice diupdate: ${nInv}`);
