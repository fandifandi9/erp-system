// Sinkronkan payment_status SO untuk invoice yang sudah lunas (perbaikan data temuan B9).
// Jalankan: node scripts/backfill-so-payment-status.mjs
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
pb.authStore.save(auth.token, auth.admin ?? {});

const invoices = await pb.collection("biz_invoices").getFullList({ requestKey: null });
const sos = await pb.collection("biz_sales_orders").getFullList({ requestKey: null });
const soById = new Map(sos.map((s) => [s.id, s]));

let fixed = 0;
for (const inv of invoices) {
  if (inv.status === "cancelled" || !inv.sales_order) continue;
  const lunas = inv.status === "paid" || (Number(inv.remaining) || 0) <= 0;
  const partial = !lunas && (Number(inv.paid_amount) || 0) > 0;
  const so = soById.get(inv.sales_order);
  if (!so) continue;
  if (so.payment_status === "refunded") continue;
  const target = lunas ? "paid" : partial ? "partial" : null;
  if (target && so.payment_status !== target) {
    await pb.collection("biz_sales_orders").update(so.id, { payment_status: target });
    console.log(`SO ${so.so_no ?? so.id}: payment_status "${so.payment_status || "(kosong)"}" → "${target}"`);
    fixed++;
  }
}
console.log(`Selesai. ${fixed} SO diperbarui.`);
