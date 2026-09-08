/**
 * Verifikasi field kritis PocketBase vs migration scripts.
 * Run: npm run audit:pb-schema
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

/** Collection → required fields for soft launch */
const REQUIRED = {
  biz_purchase_orders: [
    "receiving_workflow_json",
    "receiving_business_status",
    "warehouse_process_status",
    "share_token",
  ],
  biz_invoices: ["share_token"],
  biz_sales_orders: ["share_token"],
  users: ["locale", "session_nonce", "mobile_session_nonce", "web_access"],
};

const { url, email, pass } = loadEnv();
const base = url.replace(/\/$/, "");

const authRes = await fetch(`${base}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: email, password: pass }),
});
const auth = await authRes.json();
if (!auth.token) {
  console.error("Auth failed", auth);
  process.exit(1);
}
const headers = { Authorization: auth.token };

let missingTotal = 0;

for (const [collection, fields] of Object.entries(REQUIRED)) {
  const res = await fetch(`${base}/api/collections/${collection}`, { headers });
  const col = await res.json();
  if (!col.id) {
    console.error(`MISSING COLLECTION: ${collection}`);
    missingTotal += fields.length;
    continue;
  }
  const schema = col.schema ?? col.fields ?? [];
  const names = new Set(schema.map((f) => f.name));
  const missing = fields.filter((f) => !names.has(f));
  if (missing.length) {
    console.error(`${collection}: missing fields → ${missing.join(", ")}`);
    missingTotal += missing.length;
  } else {
    console.log(`${collection}: OK`);
  }
}

if (missingTotal) {
  console.error(`\n${missingTotal} field(s) missing. Jalankan migration npm run pb:* yang sesuai.`);
  process.exit(1);
}

console.log("\nSchema audit passed.");
