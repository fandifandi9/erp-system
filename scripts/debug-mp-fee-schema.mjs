// Debug: cek schema collection fee engine + coba create dummy untuk lihat error field.
// Jalankan: node scripts/debug-mp-fee-schema.mjs
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

// Server legacy: /api/admins/auth-with-password
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

for (const name of ["biz_mp_product_fees", "biz_mp_tier_defaults", "biz_product_tags"]) {
  try {
    const col = await pb.collections.getOne(name);
    const fields = col.fields ?? col.schema ?? [];
    console.log(`\n=== ${name} ===`);
    for (const f of fields) {
      const opt = f.options ?? f;
      console.log(
        ` - ${f.name} (${f.type})${f.required ? " required" : ""}` +
          (opt.values ? ` values=[${opt.values}]` : "") +
          (opt.maxSelect !== undefined && opt.maxSelect !== null ? ` maxSelect=${opt.maxSelect}` : ""),
      );
    }
    console.log(" indexes:", JSON.stringify(col.indexes ?? []));
  } catch (e) {
    console.log(`\n=== ${name} === ERROR: ${e.message}`);
  }
}

try {
  const tier = await pb.collection("biz_mp_seller_tiers").getFirstListItem("is_active = true", { requestKey: null });
  const prod = await pb.collection("inv_products").getFirstListItem("is_active = true", { requestKey: null });
  console.log(`\nTier uji: ${tier.id} (${tier.label}) channel=${tier.channel}`);
  console.log(`Produk uji: ${prod.id} (${prod.sku})`);
  const rec = await pb.collection("biz_mp_product_fees").create({
    channel: tier.channel,
    seller_tier: tier.id,
    product: prod.id,
    mp_calc_type: "percent",
    mp_rate: 5,
    mp_max_amount: 0,
    mp_fixed_amount: 0,
    aff_calc_type: "none",
    aff_rate: 0,
    aff_max_amount: 0,
    aff_fixed_amount: 0,
    is_active: true,
    notes: "",
  });
  console.log("\nCREATE OK:", rec.id);
  await pb.collection("biz_mp_product_fees").delete(rec.id);
  console.log("(dummy dihapus)");
} catch (e) {
  console.log("\nCREATE GAGAL:", e.message);
  console.log("Detail:", JSON.stringify(e?.response?.data ?? e?.data ?? {}, null, 2));
}

// Tes tambah produk ke tag dengan modifier products+
try {
  const tag = await pb.collection("biz_product_tags").getFirstListItem("is_active = true", { requestKey: null });
  const prod = await pb.collection("inv_products").getFirstListItem("is_active = true", { requestKey: null });
  console.log(`\nTag uji: ${tag.id} (${tag.name}) — anggota sebelum: ${(tag.products ?? []).length}`);
  const updated = await pb.collection("biz_product_tags").update(tag.id, { "products+": [prod.id] });
  console.log(`TAG UPDATE OK — anggota sesudah: ${(updated.products ?? []).length}`);
  if (!(tag.products ?? []).includes(prod.id)) {
    await pb.collection("biz_product_tags").update(tag.id, { "products-": [prod.id] });
    console.log("(rollback anggota uji)");
  }
} catch (e) {
  console.log("\nTAG UPDATE GAGAL:", e.message);
  console.log("Detail:", JSON.stringify(e?.response?.data ?? e?.data ?? {}, null, 2));
}
