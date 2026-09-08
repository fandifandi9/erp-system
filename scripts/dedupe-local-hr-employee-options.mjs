/**
 * LOCAL-ONLY: hapus duplikat di hr_employee_options (simpan satu per category+name).
 *
 * Run: node scripts/dedupe-local-hr-employee-options.mjs
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
  };
}

const { url, email, pass } = loadEnv();
if (url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL only");
  process.exit(1);
}

const auth = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
}).then((r) => r.json());
if (!auth.token) {
  console.error("Admin auth failed");
  process.exit(1);
}
const token = auth.token;

const data = await fetch(`${url}/api/collections/hr_employee_options/records?perPage=500&sort=sort_order,created`, {
  headers: { Authorization: token },
}).then((r) => r.json());

const keep = new Map();
const toDelete = [];

for (const row of data.items || []) {
  const key = `${row.category}|${row.name.trim().toLowerCase()}`;
  if (keep.has(key)) {
    toDelete.push(row.id);
  } else {
    keep.set(key, row.id);
  }
}

console.log(`Found ${data.totalItems} rows, deleting ${toDelete.length} duplicates...`);

for (const id of toDelete) {
  const res = await fetch(`${url}/api/collections/hr_employee_options/records/${id}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("DELETE failed", id, res.status, body.slice(0, 120));
    process.exit(1);
  }
}

const after = await fetch(`${url}/api/collections/hr_employee_options/records?perPage=1`, {
  headers: { Authorization: token },
}).then((r) => r.json());

console.log(`Done. Remaining rows: ${after.totalItems}`);
