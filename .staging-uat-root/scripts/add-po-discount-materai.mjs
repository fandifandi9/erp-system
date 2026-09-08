// Tambah field discount_amount & materai_amount (number) ke biz_purchase_orders.
// Jalankan: node scripts/add-po-discount-materai.mjs
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

const col = await pb.collections.getOne("biz_purchase_orders");
const list = col.fields ?? col.schema ?? [];
let changed = false;
for (const name of ["discount_amount", "materai_amount"]) {
  if (list.some((f) => f.name === name)) {
    console.log(`OK: ${name} sudah ada`);
    continue;
  }
  list.push({ name, type: "number", required: false, options: { min: null, max: null } });
  changed = true;
  console.log(`+ ${name}`);
}
if (changed) {
  const payload = col.fields ? { fields: list } : { schema: list };
  await pb.collections.update(col.id, payload);
  console.log("OK: biz_purchase_orders diperbarui");
}
console.log("Selesai.");
