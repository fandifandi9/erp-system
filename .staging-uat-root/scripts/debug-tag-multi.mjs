// Tes: 1 SKU bisa punya banyak tag (cross-tag) lewat modifier products+.
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

const prod = await pb.collection("inv_products").getFirstListItem("is_active = true", { requestKey: null });
console.log("Produk uji:", prod.id, prod.sku);

const tagA = await pb.collection("biz_product_tags").create({ name: "__uji_A__", products: [], is_active: true });
const tagB = await pb.collection("biz_product_tags").create({ name: "__uji_B__", products: [], is_active: true });
try {
  await pb.collection("biz_product_tags").update(tagA.id, { "products+": [prod.id] });
  await pb.collection("biz_product_tags").update(tagB.id, { "products+": [prod.id] });
  const a = await pb.collection("biz_product_tags").getOne(tagA.id);
  const b = await pb.collection("biz_product_tags").getOne(tagB.id);
  console.log("Tag A products:", JSON.stringify(a.products));
  console.log("Tag B products:", JSON.stringify(b.products));
  const both = (a.products ?? []).includes(prod.id) && (b.products ?? []).includes(prod.id);
  console.log(both ? "OK: SKU ada di DUA tag sekaligus" : "MASALAH: SKU hilang dari salah satu tag");

  // Cek juga daftar tag aktif seperti yang dilakukan UI
  const list = await pb.collection("biz_product_tags").getFullList({ filter: "is_active = true", sort: "name", requestKey: null });
  for (const t of list.filter((t) => t.name.startsWith("__uji_"))) {
    console.log(`List UI → ${t.name}: ${JSON.stringify(t.products)}`);
  }
} catch (e) {
  console.log("GAGAL:", e.message, JSON.stringify(e?.response?.data ?? {}));
} finally {
  await pb.collection("biz_product_tags").delete(tagA.id);
  await pb.collection("biz_product_tags").delete(tagB.id);
  console.log("(tag uji dihapus)");
}
