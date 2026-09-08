/**
 * Tambah / perbaiki field customer_type di biz_customers.
 * Run: node scripts/fix-pb-customers-schema.mjs
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

const CUSTOMER_TYPE_VALUES = ["member", "regular"];

function splitCombinedSelectValue(values) {
  if (!values?.length) return null;
  if (values.length > 1) return null;
  const one = values[0];
  if (!one.includes("·") && !one.includes(",") && !one.includes("|")) return null;
  return one.split(/[·,|]/).map((s) => s.trim()).filter(Boolean);
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

const colRes = await fetch(`${url}/api/collections/biz_customers`, { headers });
const col = await colRes.json();
if (!col.id) {
  console.error("Collection biz_customers tidak ditemukan", col);
  process.exit(1);
}

const schema = [...(col.schema ?? col.fields ?? [])];
let changed = false;

for (let i = 0; i < schema.length; i++) {
  const field = schema[i];
  if (field.name !== "customer_type" || field.type !== "select") continue;

  const current = field.options?.values ?? [];
  const combined = splitCombinedSelectValue(current);
  const needsFix =
    combined ||
    current.length !== CUSTOMER_TYPE_VALUES.length ||
    CUSTOMER_TYPE_VALUES.some((v) => !current.includes(v));

  if (!needsFix) {
    console.log("OK customer_type:", current);
    continue;
  }

  const fixed = combined ?? CUSTOMER_TYPE_VALUES;
  console.log("FIX customer_type:", current, "->", fixed);
  schema[i] = {
    ...field,
    options: { ...field.options, values: fixed, maxSelect: 1 },
  };
  changed = true;
}

if (!schema.some((f) => f.name === "customer_type")) {
  console.log("ADD customer_type select (member, regular)");
  schema.push({
    system: false,
    id: `custtype${Date.now().toString(36)}`,
    name: "customer_type",
    type: "select",
    required: false,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      values: CUSTOMER_TYPE_VALUES,
    },
  });
  changed = true;
}

if (!changed) {
  console.log("Schema biz_customers sudah benar.");
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

console.log("Schema biz_customers updated.");
for (const field of patchBody.schema ?? []) {
  if (field.name === "customer_type") {
    console.log("  customer_type:", field.options?.values);
  }
}
