/**
 * Buat collection inv_product_placements (penempatan produk per gudang).
 * Run: npm run pb:placements-schema
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const get = (k) => {
      const m = text.match(new RegExp(`^${k}=(.+)$`, "m"));
      if (!m) return "";
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    };
    return {
      url: get("NEXT_PUBLIC_POCKETBASE_URL"),
      email: get("POCKETBASE_ADMIN_EMAIL"),
      pass: get("POCKETBASE_ADMIN_PASSWORD"),
    };
  }
  throw new Error("No .env.local or .env");
}

const { url, email, pass } = loadEnv();

const authRes = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("Auth failed", auth);
  process.exit(1);
}

const headers = {
  Authorization: auth.token,
  "Content-Type": "application/json",
};

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 15);
}

function relationField(name, collectionId, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required: true,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: 1,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan`);
  return col.id;
}

const productsId = await getCollectionId("inv_products");
const warehousesId = await getCollectionId("inv_warehouses");
const locationsId = await getCollectionId("inv_locations");

const existingRes = await fetch(`${url}/api/collections/inv_product_placements`, { headers });
const existing = await existingRes.json();

if (!existing.id) {
  console.log("CREATE inv_product_placements");
  const createRes = await fetch(`${url}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "inv_product_placements",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      schema: [
        relationField("product", productsId, "plprod"),
        relationField("warehouse", warehousesId, "plwh"),
        relationField("location", locationsId, "plloc"),
        {
          system: false,
          id: fieldId("plact"),
          name: "is_active",
          type: "bool",
          required: false,
          presentable: false,
          unique: false,
          options: {},
        },
      ],
    }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Create failed", created);
    process.exit(1);
  }
  console.log("OK created:", created.name);
} else {
  console.log("Collection inv_product_placements sudah ada — skip create");
}

const colRes = await fetch(`${url}/api/collections/inv_product_placements`, { headers });
const col = await colRes.json();
const schema = [...(col.schema ?? col.fields ?? [])];

if (!schema.some((f) => f.name === "is_active")) {
  schema.push({
    system: false,
    id: fieldId("plact"),
    name: "is_active",
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  });
  const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ schema }),
  });
  const patched = await patchRes.json();
  if (!patchRes.ok) {
    console.error("PATCH failed", patched);
    process.exit(1);
  }
  console.log("OK added is_active");
}

console.log("\nMigrasi default_location → penempatan per gudang (opsional)...");

const productsRes = await fetch(
  `${url}/api/collections/inv_products/records?filter=${encodeURIComponent('is_active = true && default_location != ""')}&perPage=500&expand=default_location`,
  { headers },
);
const productsBody = await productsRes.json();
const products = productsBody.items ?? [];

let migrated = 0;
for (const p of products) {
  const loc = p.expand?.default_location;
  if (!loc?.id || !loc.warehouse) continue;
  const wh = loc.warehouse;
  const filter = encodeURIComponent(`warehouse = "${wh}" && product = "${p.id}"`);
  const checkRes = await fetch(
    `${url}/api/collections/inv_product_placements/records?filter=${filter}&perPage=1`,
    { headers },
  );
  const check = await checkRes.json();
  if (check.items?.length) continue;

  const createRec = await fetch(`${url}/api/collections/inv_product_placements/records`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      product: p.id,
      warehouse: wh,
      location: loc.id,
      is_active: true,
    }),
  });
  if (createRec.ok) {
    migrated++;
    console.log(`  + ${p.sku || p.id} → gudang ${wh} / ${loc.code || loc.id}`);
  }
}

console.log(`Migrasi selesai: ${migrated} record baru.`);
console.log("\nSelesai. Setiap gudang punya penempatan sendiri; menyimpan di Gudang B tidak menghapus Gudang A.");
