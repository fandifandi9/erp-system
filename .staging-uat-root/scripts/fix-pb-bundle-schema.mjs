/**
 * Bundle produk — komponen per SKU bundle (inv_product_bundle_lines).
 * Run: npm run pb:bundle-schema
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

async function getCollectionId(name) {
  const res = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await res.json();
  if (!col.id) throw new Error(`Collection ${name} tidak ditemukan`);
  return col.id;
}

function relationField(name, collectionId, idPrefix, required = true) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

const productsId = await getCollectionId("inv_products");

const existingRes = await fetch(`${url}/api/collections/inv_product_bundle_lines`, { headers });
const existing = await existingRes.json();

if (!existing.id) {
  console.log("CREATE inv_product_bundle_lines");
  const createRes = await fetch(`${url}/api/collections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "inv_product_bundle_lines",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      schema: [
        relationField("bundle_product", productsId, "bndl"),
        relationField("component_product", productsId, "bncmp"),
        {
          system: false,
          id: fieldId("bnqty"),
          name: "qty",
          type: "number",
          required: true,
          presentable: false,
          unique: false,
          options: { min: 0.0001, max: null, noDecimal: false },
        },
        {
          system: false,
          id: fieldId("bnsort"),
          name: "sort_order",
          type: "number",
          required: false,
          presentable: false,
          unique: false,
          options: { min: 0, max: null, noDecimal: true },
        },
        {
          system: false,
          id: fieldId("bnact"),
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
  console.log("Collection inv_product_bundle_lines dibuat.");
} else {
  console.log("Collection inv_product_bundle_lines sudah ada.");
}

console.log("Selesai — schema bundle siap.");
