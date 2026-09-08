/**
 * LOCAL-ONLY migration: buat koleksi `hr_employee_options`.
 *
 * Run:
 *   node scripts/migrate-local-hr-employee-options.mjs
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
 *   POCKETBASE_ADMIN_EMAIL=...
 *   POCKETBASE_ADMIN_PASSWORD=...
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
  throw new Error("No .env.local or .env with PocketBase config");
}

const { url, email, pass } = loadEnv();
const BASE = url.replace(/\/$/, "");

if (!BASE || !email || !pass) {
  console.error("BLOCKED — NEXT_PUBLIC_POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD required");
  process.exit(1);
}

const blocked =
  BASE.includes("pb.serba.space") ||
  BASE.includes("serba.space") ||
  BASE.includes(":8091") ||
  BASE.includes(":8092") ||
  BASE.includes("pb-staging");
if (blocked) {
  console.error("BLOCKED — script ini hanya untuk PocketBase LOCAL (:8090).");
  process.exit(1);
}

const HR_OR_OWNER =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

const HR_EMPLOYEE_OPTIONS_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

const SCHEMA = [
  {
    name: "category",
    type: "select",
    required: true,
    system: false,
    options: { maxSelect: 1, values: ["position", "department", "division"] },
  },
  {
    name: "name",
    type: "text",
    required: true,
    system: false,
    options: { min: null, max: null, pattern: "" },
  },
  {
    name: "sort_order",
    type: "number",
    required: false,
    system: false,
    options: { min: null, max: null, noDecimal: false },
  },
  {
    name: "is_active",
    type: "bool",
    required: false,
    system: false,
    options: {},
  },
];

console.log(`Target: ${BASE}`);
console.log("Migration: ensure hr_employee_options collection");

const authRes = await fetch(`${BASE}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json().catch(() => ({}));
if (!auth.token) {
  console.error("Admin auth failed:", authRes.status, JSON.stringify(auth).slice(0, 200));
  process.exit(1);
}
const token = auth.token;
console.log("Admin auth OK");

const existingRes = await fetch(`${BASE}/api/collections/hr_employee_options`, {
  headers: { Authorization: token },
});

if (existingRes.ok) {
  const col = await existingRes.json();
  const names = new Set((col.schema || []).map((f) => f.name));
  const nextSchema = [...(col.schema || [])];
  for (const f of SCHEMA) {
    if (!names.has(f.name)) nextSchema.push(f);
  }
  const patchRes = await fetch(`${BASE}/api/collections/${col.id}`, {
    method: "PATCH",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      schema: nextSchema,
      ...HR_EMPLOYEE_OPTIONS_RULES,
    }),
  });
  const patched = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    console.error("PATCH hr_employee_options failed:", patchRes.status, JSON.stringify(patched).slice(0, 400));
    process.exit(1);
  }
  console.log("hr_employee_options already exists — schema/rules updated.");
} else {
  const createRes = await fetch(`${BASE}/api/collections`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "hr_employee_options",
      type: "base",
      schema: SCHEMA,
      ...HR_EMPLOYEE_OPTIONS_RULES,
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    console.error("CREATE hr_employee_options failed:", createRes.status, JSON.stringify(created).slice(0, 400));
    process.exit(1);
  }
  console.log("hr_employee_options created.");
}

console.log("Done. Refresh halaman karyawan — opsi akan di-seed otomatis saat pertama dibuka.");
