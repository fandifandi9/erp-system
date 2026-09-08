// Tambah field relasi cash_account (→ biz_cash_accounts) ke biz_payments & biz_bill_payments.
// Jalankan: node scripts/add-cash-account-to-payments.mjs
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

const cashCol = await pb.collections.getOne("biz_cash_accounts");
console.log("biz_cash_accounts id:", cashCol.id);

for (const name of ["biz_payments", "biz_bill_payments"]) {
  const col = await pb.collections.getOne(name);
  const list = col.fields ?? col.schema ?? [];
  if (list.some((f) => f.name === "cash_account")) {
    console.log(`OK: ${name} sudah punya cash_account`);
    continue;
  }
  list.push({
    name: "cash_account",
    type: "relation",
    required: false,
    options: {
      collectionId: cashCol.id,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  });
  const payload = col.fields ? { fields: list } : { schema: list };
  await pb.collections.update(col.id, payload);
  console.log(`OK: cash_account ditambahkan ke ${name}`);
}
console.log("Selesai.");
