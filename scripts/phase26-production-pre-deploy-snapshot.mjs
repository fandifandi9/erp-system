/**
 * Phase 26 — Pre/post deploy production data counts + notification schema check.
 * GET-ONLY. Zero writes.
 */
import fs from "fs";
import path from "path";

function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

const prodText = fs.existsSync(path.join(process.cwd(), ".env.local.production-backup"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8")
  : "";
const PROD_URL = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const PROD_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const PROD_PASS = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

async function adminAuth() {
  const r = await fetch(`${PROD_URL}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PROD_EMAIL, password: PROD_PASS }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`Auth failed (${r.status})`);
  return d.token;
}

async function getCol(token, name) {
  const r = await fetch(`${PROD_URL}/api/collections/${name}`, { headers: { Authorization: token } });
  if (r.status === 404) return null;
  return r.json().catch(() => null);
}

async function getCount(token, col) {
  const r = await fetch(`${PROD_URL}/api/collections/${col}/records?page=1&perPage=1`, {
    headers: { Authorization: token },
  });
  const d = await r.json().catch(() => ({}));
  return d.totalItems ?? null;
}

const COUNT_COLS = [
  "users", "profiles", "leave_requests", "notifications", "push_tokens",
  "hr_rating_periods", "hr_rating_assignments", "hr_rating_results",
  "hr_staff_reports", "hr_findings", "hr_case_attachments",
];

const NOTIF_FIELDS = ["recipient", "type", "title", "body", "resource_type", "resource_id", "action", "read_at", "idempotency_key"];
const PT_FIELDS = ["user", "token", "platform", "device_id", "is_active", "last_seen"];

console.log("=== Phase 26 Production Pre-Deploy Snapshot (GET-ONLY) ===");
console.log("Target:", PROD_URL);
console.log("Time:", new Date().toISOString());
console.log("");

const token = await adminAuth();
console.log("Admin auth: OK\n");

let pass = true;
const snapshot = { at: new Date().toISOString(), url: PROD_URL, counts: {}, schema: {} };

// Notification collections
for (const name of ["notifications", "push_tokens"]) {
  const col = await getCol(token, name);
  const exists = !!col;
  console.log(`${exists ? "✓" : "✗"} ${name}: ${exists ? "EXISTS" : "MISSING"}`);
  if (!exists) { pass = false; continue; }
  const fields = (col.schema || []).map((f) => f.name);
  const required = name === "notifications" ? NOTIF_FIELDS : PT_FIELDS;
  for (const f of required) {
    const ok = fields.includes(f);
    console.log(`  ${ok ? "✓" : "✗"} field ${f}`);
    if (!ok) pass = false;
  }
  snapshot.schema[name] = {
    listRule: col.listRule,
    viewRule: col.viewRule,
    createRule: col.createRule,
    updateRule: col.updateRule,
    deleteRule: col.deleteRule,
    fields,
  };
}

console.log("\n── Record counts ──");
for (const col of COUNT_COLS) {
  const n = await getCount(token, col);
  snapshot.counts[col] = n;
  console.log(`  ${col}: ${n ?? "N/A"}`);
}

const outPath = path.join(process.cwd(), "docs", "_phase26_production_pre_deploy.json");
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log("\nSnapshot saved:", outPath);
console.log("Overall:", pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
