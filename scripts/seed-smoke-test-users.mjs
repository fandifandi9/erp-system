/**
 * Buat / sinkronkan akun dummy untuk smoke test E2E.
 * Run: npm run smoke:seed
 *
 * Env (.env.local):
 *   SMOKE_PASSWORD=SerbaSmoke2026!   (default jika kosong)
 *   SMOKE_EMAIL_DOMAIN=serba.test    (default)
 */
import fs from "fs";
import path from "path";

const DEFAULT_PASSWORD = "SerbaSmoke2026!";
const DEFAULT_DOMAIN = "serba.test";

function loadEnv() {
  const out = {};
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
    break;
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v && !out[k]) out[k] = v;
  }
  return out;
}

const env = loadEnv();
const PB_URL = (env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const ADMIN_EMAIL = env.POCKETBASE_ADMIN_EMAIL?.trim() || "";
const ADMIN_PASS = env.POCKETBASE_ADMIN_PASSWORD?.trim() || "";
const SMOKE_PASSWORD = env.SMOKE_PASSWORD?.trim() || DEFAULT_PASSWORD;
const EMAIL_DOMAIN = env.SMOKE_EMAIL_DOMAIN?.trim() || DEFAULT_DOMAIN;

/** Akun dummy — prefix smoke- agar mudah dihapus / dikenali */
const SMOKE_USERS = [
  {
    slug: "hr",
    label: "HR Admin",
    name: "Smoke HR Admin",
    role_code: "hr",
    inventory_role: "none",
    web_access: true,
    dashboard_access: true,
  },
  {
    slug: "employee",
    label: "Employee",
    name: "Smoke Employee",
    role_code: "staff",
    inventory_role: "none",
    web_access: true,
    dashboard_access: true,
  },
  {
    slug: "warehouse",
    label: "Warehouse Staff",
    name: "Smoke Warehouse",
    role_code: "staff",
    inventory_role: "staff",
    web_access: true,
    dashboard_access: true,
  },
  {
    slug: "supervisor",
    label: "Warehouse Supervisor",
    name: "Smoke Supervisor",
    role_code: "staff",
    inventory_role: "supervisor",
    web_access: true,
    dashboard_access: true,
  },
  {
    slug: "admin-bisnis",
    label: "Purchasing / Sales Admin",
    name: "Smoke Admin Bisnis",
    role_code: "staff",
    inventory_role: "admin",
    web_access: true,
    dashboard_access: true,
  },
];

if (!PB_URL || !ADMIN_EMAIL || !ADMIN_PASS) {
  console.error("NEXT_PUBLIC_POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD wajib.");
  process.exit(1);
}

async function adminAuth() {
  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  const data = await res.json();
  if (!data.token) throw new Error("Admin auth gagal");
  return data.token;
}

async function findUser(token, email) {
  const esc = email.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const res = await fetch(
    `${PB_URL}/api/collections/users/records?perPage=1&filter=${encodeURIComponent(`email = "${esc}"`)}`,
    { headers: { Authorization: token } },
  );
  const data = await res.json();
  return data.items?.[0] ?? null;
}

async function upsertUser(token, spec) {
  const email = `smoke-${spec.slug}@${EMAIL_DOMAIN}`;
  const body = {
    email,
    name: spec.name,
    password: SMOKE_PASSWORD,
    passwordConfirm: SMOKE_PASSWORD,
    account_type: "user",
    role_code: spec.role_code,
    role: spec.role_code,
    dashboard_access: spec.dashboard_access,
    inventory_role: spec.inventory_role,
    web_access: spec.web_access,
    status: "active",
    locale: "id",
  };

  const existing = await findUser(token, email);
  if (existing) {
    const res = await fetch(`${PB_URL}/api/collections/users/records/${existing.id}`, {
      method: "PATCH",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Update ${email} gagal: ${JSON.stringify(data)}`);
    return { email, id: data.id, action: "updated" };
  }

  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create ${email} gagal: ${JSON.stringify(data)}`);
  return { email, id: data.id, action: "created" };
}

async function ensureProfile(token, userId, name, email) {
  const esc = userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const listRes = await fetch(
    `${PB_URL}/api/collections/profiles/records?perPage=1&filter=${encodeURIComponent(`user = "${esc}"`)}`,
    { headers: { Authorization: token } },
  );
  const list = await listRes.json();
  if (list.items?.[0]) return { action: "exists", id: list.items[0].id };

  let officeId = "";
  try {
    const offRes = await fetch(
      `${PB_URL}/api/collections/offices/records?perPage=1&filter=${encodeURIComponent("is_active = true")}`,
      { headers: { Authorization: token } },
    );
    const off = await offRes.json();
    officeId = off.items?.[0]?.id ?? "";
  } catch {
    /* optional */
  }

  const profileBody = {
    user: userId,
    name,
    email,
    shift_start: "08:00",
    shift_end: "17:00",
    profile_status: "incomplete",
    ...(officeId ? { office_id: officeId } : {}),
  };

  const res = await fetch(`${PB_URL}/api/collections/profiles/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(profileBody),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Profile for ${email} gagal: ${JSON.stringify(data)}`);
  return { action: "created", id: data.id };
}

console.log("=== Seed Smoke Test Users ===");
console.log(`PB: ${PB_URL}`);
console.log(`Domain: @${EMAIL_DOMAIN}`);

const token = await adminAuth();
const results = [];

for (const spec of SMOKE_USERS) {
  try {
    const u = await upsertUser(token, spec);
    const p = await ensureProfile(token, u.id, spec.name, u.email);
    results.push({ ...spec, email: u.email, userAction: u.action, profileAction: p.action, ok: true });
    console.log(`OK ${spec.label}: ${u.email} (${u.action}, profile ${p.action})`);
  } catch (e) {
    results.push({ ...spec, ok: false, error: e instanceof Error ? e.message : String(e) });
    console.error(`FAIL ${spec.label}:`, e instanceof Error ? e.message : e);
  }
}

const accountsDoc = [
  "# Smoke Test Accounts (dummy)",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "**Password:** lihat `SMOKE_PASSWORD` di `.env.local` (default script: `SerbaSmoke2026!`)",
  "",
  "| Label | Email | role_code | inventory_role |",
  "| --- | --- | --- | --- |",
];
for (const r of results.filter((x) => x.ok)) {
  accountsDoc.push(`| ${r.label} | \`${r.email}\` | ${r.role_code} | ${r.inventory_role} |`);
}
accountsDoc.push(
  "",
  "## Perintah",
  "",
  "```bash",
  "npm run smoke:seed   # buat/update akun",
  "npm run smoke:test   # jalankan smoke test",
  "```",
  "",
  "Akun prefix `smoke-*` aman dihapus setelah QA.",
);

const outPath = path.join(process.cwd(), "docs", "SMOKE_TEST_ACCOUNTS.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, accountsDoc.join("\n"));

// Tulis SMOKE_PASSWORD ke .env.local jika belum ada
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  if (!/^SMOKE_PASSWORD=/m.test(raw)) {
    fs.appendFileSync(envPath, `\n# Smoke test dummy accounts (npm run smoke:seed)\nSMOKE_PASSWORD=${SMOKE_PASSWORD}\n`);
    console.log("Ditambahkan SMOKE_PASSWORD ke .env.local");
  }
}

console.log(`\nAccounts doc: ${outPath}`);
console.log(`Password untuk semua akun smoke: ${SMOKE_PASSWORD}`);
console.log("\nJalankan: npm run smoke:test");

const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);
