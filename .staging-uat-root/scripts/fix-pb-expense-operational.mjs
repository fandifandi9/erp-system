// Fase 3: biaya operasional — warehouse + cash_account di biz_expenses.
// Jalankan: node scripts/fix-pb-expense-operational.mjs
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

const whColId = (await pb.collections.getOne("inv_warehouses")).id;
const cashColId = (await pb.collections.getOne("biz_cash_accounts")).id;

const rel = (name, collectionId, required = false) => ({
  name,
  type: "relation",
  required,
  options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
});

await patchCollection("biz_expenses", [
  rel("warehouse", whColId),
  rel("cash_account", cashColId),
]);

const stores = await pb.collection("biz_stores").getFullList({ requestKey: null });
const storeMap = Object.fromEntries(
  stores.map((s) => [s.id, { company: s.company, default_warehouse: s.default_warehouse }]),
);

const rows = await pb.collection("biz_expenses").getFullList({ requestKey: null });
let n = 0;
for (const r of rows) {
  const patch = {};
  if (r.store && storeMap[r.store]) {
    const st = storeMap[r.store];
    if (!r.company && st.company) patch.company = st.company;
    if (!r.warehouse && st.default_warehouse) patch.warehouse = st.default_warehouse;
  }
  if (Object.keys(patch).length) {
    await pb.collection("biz_expenses").update(r.id, patch);
    n++;
  }
}
console.log(`Backfill biz_expenses: ${n} record`);
console.log("Selesai — biaya operasional warehouse + cash_account.");
