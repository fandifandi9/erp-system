/**
 * Perbaiki schema biz_mp_fee_template_lines di PocketBase.
 * Run: node scripts/fix-pb-fee-lines-schema.mjs
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

const SELECT_FIXES = {
  line_group: ["mp_fee", "operational", "category", "product"],
  calc_type: ["percent", "percent_cap", "fixed", "fixed_per_qty"],
  applies_to: ["line", "order"],
};

function splitCombinedSelectValue(values) {
  if (!values?.length) return null;
  if (values.length > 1) return null;
  const one = values[0];
  if (!one.includes("·") && !one.includes(",")) return null;
  return one.split(/[·,]/).map((s) => s.trim()).filter(Boolean);
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

const colRes = await fetch(`${url}/api/collections/biz_mp_fee_template_lines`, { headers });
const col = await colRes.json();
const schema = [...(col.schema ?? col.fields ?? [])];

let changed = false;

for (let i = 0; i < schema.length; i++) {
  const field = schema[i];
  const fix = SELECT_FIXES[field.name];
  if (!fix || field.type !== "select") continue;

  const current = field.options?.values ?? [];
  const needsFix =
    current.length !== fix.length ||
    fix.some((v) => !current.includes(v)) ||
    splitCombinedSelectValue(current);

  if (!needsFix) {
    console.log(`OK ${field.name}:`, current);
    continue;
  }

  console.log(`FIX ${field.name}:`, current, "->", fix);
  changed = true;
  schema[i] = {
    ...field,
    options: { ...field.options, values: fix, maxSelect: field.options?.maxSelect ?? 1 },
  };
}

if (!schema.some((f) => f.name === "is_default")) {
  console.log("ADD is_default bool");
  schema.push({
    system: false,
    id: `isdef${Date.now().toString(36)}`,
    name: "is_default",
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  });
  changed = true;
}

if (!schema.some((f) => f.name === "scope_product")) {
  const prodColRes = await fetch(`${url}/api/collections/inv_products`, { headers });
  const prodCol = await prodColRes.json();
  if (prodCol.id) {
    console.log("ADD scope_product relation -> inv_products");
    schema.push({
      system: false,
      id: `scprod${Date.now().toString(36)}`,
      name: "scope_product",
      type: "relation",
      required: false,
      presentable: false,
      unique: false,
      options: {
        collectionId: prodCol.id,
        cascadeDelete: false,
        minSelect: null,
        maxSelect: 1,
        displayFields: ["sku", "name"],
      },
    });
    changed = true;
  } else {
    console.warn("inv_products collection not found — add scope_product manually");
  }
}

if (!changed) {
  console.log("Schema sudah benar.");
  process.exit(0);
}

const patchRes = await fetch(`${url}/api/collections/${col.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ schema }),
});
const patchBody = await patchRes.json();
if (!patchRes.ok) {
  console.error("PATCH failed", patchRes.status, patchBody);
  process.exit(1);
}

console.log("Schema updated.");
for (const field of patchBody.schema ?? []) {
  if (field.type === "select") console.log(`  ${field.name}:`, field.options?.values);
  if (field.name === "scope_product") console.log("  scope_product: relation -> inv_products");
}
