/**
 * Cek Select values di collection MP — flag jika digabung jadi satu baris.
 * Run: node scripts/check-pb-fee-schema.mjs
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

const COLLECTIONS = [
  "biz_mp_fee_template_lines",
  "biz_mp_fee_templates",
  "biz_sales_import_batches",
];

const { url, email, pass } = loadEnv();
const authRes = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("auth failed", auth);
  process.exit(1);
}
const headers = { Authorization: auth.token };

for (const name of COLLECTIONS) {
  const colRes = await fetch(`${url}/api/collections/${name}`, { headers });
  const col = await colRes.json();
  if (!colRes.ok) {
    console.log(`\n${name}: NOT FOUND (${colRes.status})`);
    continue;
  }
  console.log(`\n=== ${name} ===`);
  for (const f of col.schema ?? []) {
    if (f.type === "select") {
      const vals = f.options?.values ?? [];
      const bad = vals.length === 1 && (vals[0].includes("·") || vals[0].includes(","));
      console.log(`  ${f.name}:`, vals, bad ? "⚠ GABUNG — jalankan fix-pb-fee-lines-schema.mjs" : "OK");
    }
  }
}
