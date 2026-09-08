// Multi-entitas: company FK di cash_accounts, active_company di users, code/is_active di company profile.
// Backfill: assign semua store/gudang/akun kas tanpa company ke entitas pertama.
// Jalankan: node scripts/fix-pb-multi-entity.mjs
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
  return col.id;
}

const companyColId = (await pb.collections.getOne("biz_company_profile")).id;
const storeColId = (await pb.collections.getOne("biz_stores")).id;

const rel = (name, collectionId, required = false) => ({
  name,
  type: "relation",
  required,
  options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
});

// 1. biz_company_profile: code + is_active
await patchCollection("biz_company_profile", [
  { name: "code", type: "text", required: false, options: {} },
  { name: "is_active", type: "bool", required: false, options: {} },
]);

// 2. biz_cash_accounts: company
await patchCollection("biz_cash_accounts", [rel("company", companyColId)]);

// 3. users: active_company + default_company
await patchCollection("users", [
  rel("active_company", companyColId),
  rel("default_company", companyColId),
]);

// 4. Pastikan biz_stores.company & inv_warehouses.company ada
await patchCollection("biz_stores", [rel("company", companyColId)]);
await patchCollection("inv_warehouses", [
  rel("company", companyColId),
  rel("store", storeColId),
]);

// ── Backfill ──
const companies = await pb.collection("biz_company_profile").getFullList({ sort: "created", requestKey: null });
let defaultCompany = companies[0];
if (!defaultCompany) {
  defaultCompany = await pb.collection("biz_company_profile").create({
    company_name: "Perusahaan Utama",
    legal_name: "Perusahaan Utama",
    code: "MAIN",
    is_active: true,
  });
  console.log("OK: entitas default dibuat:", defaultCompany.id);
}
const cid = defaultCompany.id;
console.log("Entitas default:", defaultCompany.company_name, `(${cid})`);

for (const col of ["biz_stores", "inv_warehouses", "biz_cash_accounts"]) {
  const rows = await pb.collection(col).getFullList({ requestKey: null });
  let n = 0;
  for (const r of rows) {
    if (!r.company) {
      await pb.collection(col).update(r.id, { company: cid });
      n++;
    }
  }
  if (n) console.log(`Backfill ${col}: ${n} record`);
}

console.log("Selesai.");
