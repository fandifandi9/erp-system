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
const auth = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
}).then((r) => r.json());

const data = await fetch(`${url}/api/collections/hr_employee_options/records?perPage=500`, {
  headers: { Authorization: auth.token },
}).then((r) => r.json());

const byCat = {};
const seen = new Map();
let dupes = 0;
for (const r of data.items || []) {
  byCat[r.category] = (byCat[r.category] || 0) + 1;
  const key = `${r.category}|${r.name}`;
  if (seen.has(key)) dupes++;
  else seen.set(key, r.id);
}
console.log("total", data.totalItems);
console.log("by category", byCat);
console.log("duplicate rows", dupes);
