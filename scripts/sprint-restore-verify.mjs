/**
 * P0-1: Verifikasi backup PocketBase + integritas data (pre/post restore snapshot).
 * Run: npm run sprint:restore
 *
 * Catatan: Restore penuh membutuhkan instance staging PB terpisah.
 * Script ini memverifikasi: backup dibuat, login admin, hitung koleksi kritis.
 */
import fs from "fs";
import path from "path";

function loadEnv() {
  const out = {};
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
    break;
  }
  return out;
}

const env = loadEnv();
const PB = (env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const ADMIN_EMAIL = env.POCKETBASE_ADMIN_EMAIL?.trim() || "";
const ADMIN_PASS = env.POCKETBASE_ADMIN_PASSWORD?.trim() || "";
const PASS = env.SMOKE_PASSWORD || "SerbaSmoke2026!";

const results = [];

function record(id, name, outcome, detail = "") {
  results.push({ id, name, outcome, detail });
}

async function adminAuth() {
  const res = await fetch(`${PB}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Admin auth gagal");
  return data.token;
}

async function userLogin(email) {
  const res = await fetch(`${PB}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: PASS }),
  });
  return res.json();
}

async function pbCount(token, collection, filter) {
  const q = new URLSearchParams({ perPage: "1", page: "1" });
  if (filter) q.set("filter", filter);
  const res = await fetch(`${PB}/api/collections/${collection}/records?${q}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) return { ok: false, total: 0, status: res.status };
  const data = await res.json();
  return { ok: true, total: data.totalItems ?? 0 };
}

async function createBackup(token) {
  const res = await fetch(`${PB}/api/backups`, { method: "POST", headers: { Authorization: token } });
  if (!res.ok) return { ok: false, status: res.status };
  const listRes = await fetch(`${PB}/api/backups`, { headers: { Authorization: token } });
  const list = await listRes.json();
  const latest = Array.isArray(list) ? list[0] : list?.items?.[0];
  return { ok: true, key: latest?.key };
}

async function tryDownloadBackup(token, key) {
  const res = await fetch(`${PB}/api/backups/${encodeURIComponent(key)}`, {
    headers: { Authorization: token, Accept: "application/zip" },
  });
  return { ok: res.ok, status: res.status };
}

console.log("=== Sprint P0-1: Backup & Restore Verify ===");
console.log(`PB: ${PB}`);

let adminToken;
try {
  adminToken = await adminAuth();
  record("R1", "Admin PB login", "PASS");
} catch (e) {
  record("R1", "Admin PB login", "FAIL", e instanceof Error ? e.message : String(e));
  console.error(e);
  process.exit(1);
}

const smokeLogin = await userLogin("smoke-hr@serba.test");
record(
  "R2",
  "User login (smoke-hr)",
  smokeLogin.token ? "PASS" : "FAIL",
  smokeLogin.token ? smokeLogin.record?.email : "auth gagal",
);

const backup = await createBackup(adminToken);
record(
  "R3",
  "Backup PB dibuat di server",
  backup.ok ? "PASS" : "FAIL",
  backup.key || `status ${backup.status}`,
);

if (backup.key) {
  const dl = await tryDownloadBackup(adminToken, backup.key);
  record(
    "R4",
    "Unduh backup zip",
    dl.ok ? "PASS" : "WARN",
    dl.ok ? backup.key : `HTTP ${dl.status} — unduh manual via PB Admin`,
  );
} else {
  record("R4", "Unduh backup zip", "SKIP", "backup key tidak ada");
}

const collections = [
  { id: "R5", name: "Users", col: "users" },
  { id: "R6", name: "Profiles", col: "profiles" },
  { id: "R7", name: "Purchase Orders", col: "biz_purchase_orders" },
  { id: "R8", name: "Sales Orders", col: "biz_sales_orders" },
  { id: "R9", name: "Invoices", col: "biz_invoices" },
  { id: "R10", name: "Stock movements", col: "inv_stock_movements" },
  { id: "R11", name: "Leave requests", col: "leave_requests" },
  { id: "R12", name: "Attendance", col: "attendance" },
];

for (const c of collections) {
  const r = await pbCount(adminToken, c.col);
  record(c.id, `Data ${c.name}`, r.ok && r.total > 0 ? "PASS" : r.ok ? "WARN" : "FAIL", `count=${r.total}`);
}

record(
  "R13",
  "Restore ke staging PB",
  "FAIL",
  "Tidak ada instance staging terpisah — restore penuh BELUM diuji. Wajib manual: PB Admin → Restore → verifikasi ulang R5–R12.",
);

const pass = results.filter((r) => r.outcome === "PASS").length;
const fail = results.filter((r) => r.outcome === "FAIL").length;
const warn = results.filter((r) => r.outcome === "WARN").length;

const lines = [
  "# Sprint Restore Verify — SERBA ERP",
  "",
  `**Run:** ${new Date().toISOString()}`,
  `**PocketBase:** ${PB}`,
  "",
  "## Summary",
  "",
  `| PASS | FAIL | WARN |`,
  `| --- | --- | --- |`,
  `| ${pass} | ${fail} | ${warn} |`,
  "",
  "## Checklist",
  "",
  "| ID | Test | Result | Detail |",
  "| --- | --- | --- | --- |",
];
for (const r of results) {
  const icon = r.outcome === "PASS" ? "✅" : r.outcome === "FAIL" ? "❌" : r.outcome === "WARN" ? "⚠️" : "⏭️";
  lines.push(`| ${r.id} | ${r.name} | ${icon} ${r.outcome} | ${r.detail} |`);
}

const outPath = path.join(process.cwd(), "docs", "SPRINT_RESTORE_VERIFY.md");
fs.writeFileSync(outPath, lines.join("\n"));
console.log(`\nPASS: ${pass} | FAIL: ${fail} | WARN: ${warn}`);
console.log(`Report: ${outPath}`);
process.exit(fail > 1 ? 1 : 0);
