// Perbaiki schema collection fee engine:
// - values select mp_calc_type / aff_calc_type
// - products di biz_product_tags jadi relasi multiple
// - tambah unique index
// Jalankan: node scripts/fix-mp-fee-schema.mjs
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

function setOpt(field, key, value) {
  if (field.options && typeof field.options === "object") field.options[key] = value;
  else field[key] = value;
}

async function fixCollection(name, mutate, indexes) {
  const col = await pb.collections.getOne(name);
  const list = col.fields ?? col.schema ?? [];
  mutate(list);
  const payload = {};
  if (col.fields) payload.fields = list;
  else payload.schema = list;
  if (indexes) payload.indexes = indexes;
  try {
    await pb.collections.update(col.id, payload);
    console.log(`OK: ${name} diperbarui`);
  } catch (e) {
    console.log(`GAGAL update ${name} (dengan index): ${e.message}`);
    if (indexes) {
      delete payload.indexes;
      await pb.collections.update(col.id, payload);
      console.log(`OK: ${name} diperbarui tanpa index`);
    } else {
      console.log("Detail:", JSON.stringify(e?.response?.data ?? {}, null, 2));
    }
  }
}

await fixCollection(
  "biz_mp_product_fees",
  (fields) => {
    for (const f of fields) {
      if (f.name === "mp_calc_type") {
        setOpt(f, "values", ["percent", "percent_cap", "fixed"]);
        f.required = true;
      }
      if (f.name === "aff_calc_type") {
        setOpt(f, "values", ["inherit", "none", "percent", "percent_cap", "fixed"]);
        f.required = true;
      }
    }
  },
  ["CREATE UNIQUE INDEX `idx_mp_product_fee_unique` ON `biz_mp_product_fees` (`seller_tier`, `product`)"],
);

await fixCollection(
  "biz_mp_tier_defaults",
  (fields) => {
    for (const f of fields) {
      if (f.name === "mp_calc_type") {
        setOpt(f, "values", ["percent", "percent_cap", "fixed"]);
        f.required = true;
      }
      if (f.name === "aff_calc_type") {
        setOpt(f, "values", ["none", "percent", "percent_cap", "fixed"]);
        f.required = true;
      }
    }
  },
  ["CREATE UNIQUE INDEX `idx_mp_tier_default_unique` ON `biz_mp_tier_defaults` (`channel`, `seller_tier`)"],
);

await fixCollection("biz_product_tags", (fields) => {
  for (const f of fields) {
    if (f.name === "products") {
      setOpt(f, "maxSelect", null);
    }
  }
});

console.log("\nSelesai. Jalankan debug untuk verifikasi.");
