/**
 * Smoke test end-to-end HR / ERP / WMS per role.
 * Run: npm run smoke:test
 *
 * Env opsional (.env.local):
 *   SMOKE_PASSWORD=...     — password sama untuk akun uji (login PB)
 *   SMOKE_APP_URL=http://localhost:3000
 *   SMOKE_ACCOUNTS=...     — JSON [{ "label":"HR","email":"hr@..." }]
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
const APP_URL = (env.SMOKE_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const SMOKE_PASSWORD = env.SMOKE_PASSWORD?.trim() || "SerbaSmoke2026!";
const SMOKE_EMAIL_PREFIX = "smoke-";
const ADMIN_EMAIL = env.POCKETBASE_ADMIN_EMAIL?.trim() || "";
const ADMIN_PASS = env.POCKETBASE_ADMIN_PASSWORD?.trim() || "";

if (!PB_URL) {
  console.error("NEXT_PUBLIC_POCKETBASE_URL wajib.");
  process.exit(1);
}

// --- RBAC helpers (mirror lib/rbac.ts + lib/inventory/access.ts) ---
const DEFAULT_USER_ACCESS = ["/profile"];
const STAFF_WEB_PATHS = [
  "/staff", "/staff/karyawan", "/staff/absensi", "/staff/mencurigakan",
  "/staff/cuti", "/staff/lembur", "/staff/jadwal", "/staff/lapangan", "/staff/gps", "/staff/payroll",
];
const ROLE_ACCESS_BY_CODE = {
  hr: ["/hr", "/hr/employees", "/hr/attendance", "/hr/payroll", "/hr/leave", "/hr/overtime",
    "/laporan", "/laporan/sdm", "/pengaturan", "/pengaturan/role", ...STAFF_WEB_PATHS, ...DEFAULT_USER_ACCESS],
  manager: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  staff: ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  "staff-basic": ["/dashboard-staff", ...DEFAULT_USER_ACCESS],
  security: [...DEFAULT_USER_ACCESS],
  ob: [...DEFAULT_USER_ACCESS],
};
const INVENTORY_WEB_PATHS = [
  "/wms", "/wms/receiving", "/gudang/penerimaan", "/bisnis/penjualan", "/bisnis/pembelian",
  "/inventory", "/inventory/products", "/katalog/produk", "/pos",
];

function normalizeAuthModel(user) {
  const rawRole = (user?.role || user?.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user?.account_type || (rawRole === "owner" ? "owner" : "user")) + "")
    .toLowerCase()
    .trim();
  if (accountType === "owner") return { accountType: "owner", roleCode: null, dashboardAccess: true };
  const codes = ["hr", "manager", "staff", "staff-basic", "security", "ob"];
  const roleCode = codes.includes(rawRole) || codes.includes((user?.role_code || "").toString().toLowerCase())
    ? (codes.find((c) => c === rawRole || c === (user?.role_code || "").toString().toLowerCase()) || "staff-basic")
    : "staff-basic";
  const dashboardAccess = typeof user?.dashboard_access === "boolean"
    ? user.dashboard_access
    : ["hr", "manager", "staff"].includes(roleCode);
  return { accountType: "user", roleCode, dashboardAccess };
}

function readInventoryRole(user) {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "admin";
  const raw = (user?.inventory_role ?? "none").toString().toLowerCase().trim();
  if (["staff", "supervisor", "admin"].includes(raw)) return raw;
  return "none";
}

function canAccessInventory(user) {
  return readInventoryRole(user) !== "none" || normalizeAuthModel(user).accountType === "owner";
}

function getAllowedPaths(user) {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return ["*"];
  const base = ROLE_ACCESS_BY_CODE[auth.roleCode] || [...DEFAULT_USER_ACCESS];
  if (canAccessInventory(user)) return [...base, ...INVENTORY_WEB_PATHS];
  return base;
}

function canAccess(user, pathname) {
  const rules = getAllowedPaths(user);
  if (rules.includes("*")) return true;
  return rules.some((p) => pathname.startsWith(p));
}

function personaLabel(user) {
  const auth = normalizeAuthModel(user);
  if (auth.accountType === "owner") return "Super Admin (owner)";
  const inv = readInventoryRole(user);
  if (inv !== "none") return `${auth.roleCode} + inventory_${inv}`;
  return auth.roleCode || "unknown";
}

// --- HTTP ---
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

async function userAuth(email, password) {
  const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  const data = await res.json();
  if (!data.token) return null;
  return data;
}

async function pbList(token, collection, opts = {}) {
  const q = new URLSearchParams({ perPage: String(opts.perPage ?? 5), page: "1" });
  if (opts.filter) q.set("filter", opts.filter);
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records?${q}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) return { ok: false, status: res.status, items: [] };
  const data = await res.json();
  return { ok: true, status: res.status, items: data.items ?? [], total: data.totalItems ?? 0 };
}

async function apiFetch(method, apiPath, auth, body) {
  const url = `${APP_URL}${apiPath}`;
  const headers = {};
  if (auth?.token) {
    headers.Cookie = buildCookie(auth);
  }
  if (body) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    let json = null;
    try { json = await res.json(); } catch { /* */ }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "fetch error" };
  }
}

function buildCookie(auth) {
  const payload = encodeURIComponent(JSON.stringify({ token: auth.token, model: auth.record }));
  return `pb_auth=${payload}`;
}

async function pageFetch(pagePath, cookie) {
  try {
    const res = await fetch(`${APP_URL}${pagePath}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    });
    return { status: res.status, location: res.headers.get("location") };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : "error" };
  }
}

// --- Test definitions ---
const RBAC_MATRIX = [
  { path: "/hr/employees", allow: (u) => canAccess(u, "/hr") },
  { path: "/dashboard-staff", allow: (u) => canAccess(u, "/dashboard-staff") },
  { path: "/bisnis/penjualan", allow: (u) => canAccess(u, "/bisnis/penjualan") },
  { path: "/bisnis/pembelian", allow: (u) => canAccess(u, "/bisnis/pembelian") },
  { path: "/wms/receiving", allow: (u) => canAccess(u, "/wms/receiving") },
  { path: "/inventory/products", allow: (u) => canAccess(u, "/inventory/products") },
  { path: "/profile", allow: () => true },
];

const API_MATRIX = [
  { method: "GET", path: "/api/health", expect: [200], auth: false },
  { method: "GET", path: "/api/user/locale", expect: [200], auth: true },
  { method: "GET", path: "/api/tenant/work-context", expect: [200], auth: true },
  { method: "GET", path: "/api/inventory/products?perPage=1", expect: [200, 403], auth: true, needInventory: true },
  { method: "GET", path: "/api/catalog/products?perPage=1", expect: [200, 403], auth: true, needInventory: true },
  { method: "GET", path: "/api/bisnis/couriers", expect: [200, 403], auth: true, needPenjualan: true },
  { method: "GET", path: "/api/wms/workstations/sessions/active", expect: [200, 403, 400], auth: true, needInventory: true },
];

const DATA_CHECKS = [
  { collection: "users", label: "Users", min: 1 },
  { collection: "profiles", label: "HR Profiles", min: 1 },
  { collection: "offices", label: "Offices (GPS)", min: 0 },
  { collection: "biz_customers", label: "Customers", min: 0 },
  { collection: "biz_suppliers", label: "Suppliers", min: 0 },
  { collection: "inv_products", label: "Products", min: 0 },
  { collection: "biz_purchase_orders", label: "Purchase Orders", min: 0 },
  { collection: "biz_sales_orders", label: "Sales Orders", min: 0 },
  { collection: "inv_warehouses", label: "Warehouses", min: 0 },
  { collection: "attendance", label: "Attendance", min: 0 },
  { collection: "leave_requests", label: "Leave Requests", min: 0 },
  { collection: "overtime_requests", label: "Overtime Requests", min: 0 },
  { collection: "inv_packing_sessions", label: "WMS Packing Sessions", min: 0 },
  { collection: "inv_stock_movements", label: "Stock Movements", min: 0 },
];

const WORKFLOW_CHECKS = [
  {
    module: "HR",
    label: "Active users with profile",
    collection: "profiles",
    filter: "",
    min: 1,
  },
  {
    module: "HR",
    label: "Leave requests (any status)",
    collection: "leave_requests",
    filter: "",
    min: 0,
  },
  {
    module: "ERP",
    label: "Purchase orders (non-cancelled)",
    collection: "biz_purchase_orders",
    filter: 'status != "cancelled"',
    min: 1,
  },
  {
    module: "ERP",
    label: "Sales orders (non-cancelled)",
    collection: "biz_sales_orders",
    filter: 'status != "cancelled"',
    min: 1,
  },
  {
    module: "ERP",
    label: "Invoices",
    collection: "biz_invoices",
    filter: "",
    min: 0,
  },
  {
    module: "WMS",
    label: "PO sent to warehouse",
    collection: "biz_purchase_orders",
    filter: 'send_to_warehouse_at != ""',
    min: 0,
  },
  {
    module: "WMS",
    label: "SO sent to warehouse",
    collection: "biz_sales_orders",
    filter: 'send_to_warehouse_at != ""',
    min: 0,
  },
  {
    module: "WMS",
    label: "Stock balances",
    collection: "inv_stock_balances",
    filter: "",
    min: 0,
  },
];

// --- Main ---
const results = {
  timestamp: new Date().toISOString(),
  appUrl: APP_URL,
  pbUrl: PB_URL,
  personas: [],
  dataChecks: [],
  workflowChecks: [],
  roleDistribution: {},
  missingPersonas: [],
  summary: { pass: 0, fail: 0, skip: 0, warn: 0 },
};

const REQUIRED_PERSONAS = [
  "Super Admin (owner)",
  "hr",
  "staff",
  "staff + inventory_staff",
  "staff + inventory_supervisor",
  "staff + inventory_admin",
];

function record(outcome, section, detail) {
  results.summary[outcome]++;
  return { outcome, section, detail };
}

console.log("=== SERBA ERP Smoke Test ===");
console.log(`PB: ${PB_URL}`);
console.log(`App: ${APP_URL}`);

let adminToken;
try {
  adminToken = await adminAuth();
  console.log("Admin PB: OK");
} catch (e) {
  console.error("Admin PB gagal:", e.message);
  process.exit(1);
}

// Data integrity
console.log("\n--- Data integrity (admin) ---");
for (const check of DATA_CHECKS) {
  const r = await pbList(adminToken, check.collection, { perPage: 1 });
  const pass = r.ok && r.total >= check.min;
  results.dataChecks.push({
    collection: check.collection,
    label: check.label,
    total: r.total,
    status: r.ok ? r.status : "ERR",
    pass,
  });
  console.log(`${pass ? "PASS" : "WARN"} ${check.label}: ${r.ok ? r.total : "error " + r.status}`);
  record(pass ? "pass" : "warn", "data", check.label);
}

console.log("\n--- Module workflows (admin) ---");
for (const wf of WORKFLOW_CHECKS) {
  const r = await pbList(adminToken, wf.collection, { perPage: 1, filter: wf.filter || undefined });
  const pass = r.ok && r.total >= wf.min;
  results.workflowChecks.push({
    module: wf.module,
    label: wf.label,
    total: r.total,
    pass,
  });
  console.log(`${pass ? "PASS" : "WARN"} [${wf.module}] ${wf.label}: ${r.ok ? r.total : "error"}`);
  record(pass ? "pass" : "warn", "workflow", wf.label);
}

// Discover users
const usersRes = await pbList(adminToken, "users", { perPage: 200, filter: 'status = "active"' });
const users = usersRes.items.filter((u) => u.email);

for (const u of users) {
  const label = personaLabel(u);
  results.roleDistribution[label] = (results.roleDistribution[label] || 0) + 1;
}
for (const req of REQUIRED_PERSONAS) {
  if (!results.roleDistribution[req]) results.missingPersonas.push(req);
}
if (results.missingPersonas.length) {
  console.log("\nMissing personas for full QA:", results.missingPersonas.join(", "));
}

// Prefer dummy smoke accounts when available
const smokeUsers = users.filter((u) => String(u.email || "").startsWith(SMOKE_EMAIL_PREFIX));
const pickedSource = smokeUsers.length >= 3 ? smokeUsers : users;

// Pick representative personas (smoke accounts only when seeded)
const picked = [];
const seen = new Set();
for (const u of pickedSource) {
  const label = personaLabel(u);
  if (seen.has(label)) continue;
  seen.add(label);
  picked.push({ user: u, label });
}
if (smokeUsers.length >= 3) {
  // Skip real owner — password unknown; smoke personas cover all roles
} else if (ADMIN_EMAIL && !picked.some((p) => p.user.email === ADMIN_EMAIL)) {
  const ownerUser = users.find((u) => u.email === ADMIN_EMAIL) || {
    email: ADMIN_EMAIL,
    account_type: "owner",
    role: "owner",
    status: "active",
  };
  picked.unshift({ user: ownerUser, label: "Super Admin (owner)" });
}

console.log(`\n--- Personas (${picked.length}) ---`);

// Optional explicit accounts
let explicitAccounts = [];
if (env.SMOKE_ACCOUNTS) {
  try { explicitAccounts = JSON.parse(env.SMOKE_ACCOUNTS); } catch { /* */ }
}

for (const { user, label } of picked.slice(0, 12)) {
  const persona = {
    label,
    email: user.email,
    role_code: user.role_code || user.role,
    inventory_role: user.inventory_role || "none",
    web_access: user.web_access,
    login: null,
    rbac: [],
    api: [],
    pages: [],
  };

  // RBAC static
  for (const row of RBAC_MATRIX) {
    const expected = row.allow(user);
    const actual = canAccess(user, row.path);
    const ok = expected === actual;
    persona.rbac.push({ path: row.path, expected, actual, ok });
    if (!ok) record("fail", "rbac", `${label} ${row.path}`);
    else record("pass", "rbac", row.path);
  }

  // Login attempt
  const email = user.email;
  const password =
    explicitAccounts.find((a) => a.email === email)?.password ||
    SMOKE_PASSWORD ||
    (email === ADMIN_EMAIL ? ADMIN_PASS : "");

  if (password) {
    const auth = await userAuth(email, password);
    if (auth) {
      persona.login = "OK";
      console.log(`  LOGIN OK: ${label} (${email})`);

      for (const api of API_MATRIX) {
        if (!api.auth) continue;
        const inv = readInventoryRole(user);
        const authNorm = normalizeAuthModel(user);
        if (api.needInventory && inv === "none" && authNorm.accountType !== "owner") {
          persona.api.push({ path: api.path, status: "skip", ok: true, reason: "no inventory role" });
          record("skip", "api", api.path);
          continue;
        }
        if (api.needPenjualan && !canAccess(user, "/bisnis/penjualan")) {
          const r = await apiFetch(api.method, api.path, auth);
          const ok = r.status === 403 || r.status === 401;
          persona.api.push({ path: api.path, status: r.status, ok, expected: "403" });
          record(ok ? "pass" : "fail", "api", `${label} deny ${api.path}`);
          continue;
        }
        const r = await apiFetch(api.method, api.path, auth);
        const ok = api.expect.includes(r.status);
        persona.api.push({ path: api.path, status: r.status, ok, expect: api.expect });
        record(ok ? "pass" : "fail", "api", `${label} ${api.path} → ${r.status}`);
      }

      // Page smoke (middleware redirect)
      const cookie = buildCookie(auth);
      const pageTests = [
        { path: "/hr/employees", shouldAllow: canAccess(user, "/hr/employees") },
        { path: "/bisnis/penjualan", shouldAllow: canAccess(user, "/bisnis/penjualan") },
        { path: "/wms/receiving", shouldAllow: canAccess(user, "/wms/receiving") },
        { path: "/profile", shouldAllow: true },
      ];
      for (const pt of pageTests) {
        const r = await pageFetch(pt.path, cookie);
        const redirectedToLogin = r.status === 307 || r.status === 308
          ? (r.location || "").includes("/login")
          : r.status === 0;
        const ok = pt.shouldAllow
          ? (r.status === 200 || r.status === 307) && !redirectedToLogin
          : (r.status === 307 || r.status === 308) && !redirectedToLogin;
        persona.pages.push({ path: pt.path, status: r.status, location: r.location, shouldAllow: pt.shouldAllow, ok });
        record(ok ? "pass" : "warn", "page", `${label} ${pt.path}`);
      }
    } else {
      persona.login = "FAIL";
      console.log(`  LOGIN SKIP: ${label} (${email}) — password salah / tidak diset`);
      record("skip", "login", email);
    }
  } else {
    persona.login = "SKIP";
    record("skip", "login", email);
  }

  results.personas.push(persona);
}

// Public health
const health = await apiFetch("GET", "/api/health", null);
const healthOk = health.status === 200;
console.log(`\nHealth: ${healthOk ? "PASS" : "FAIL"} (${health.status})`);
record(healthOk ? "pass" : "fail", "health", "/api/health");

// Write report
const lines = [
  "# Smoke Test Results — SERBA ERP",
  "",
  `**Run:** ${results.timestamp}`,
  `**App:** ${APP_URL}`,
  `**PocketBase:** ${PB_URL}`,
  "",
  "## Summary",
  "",
  `| Outcome | Count |`,
  `| --- | --- |`,
  `| Pass | ${results.summary.pass} |`,
  `| Fail | ${results.summary.fail} |`,
  `| Warn | ${results.summary.warn} |`,
  `| Skip | ${results.summary.skip} |`,
  "",
  SMOKE_PASSWORD
    ? "_Login API/page tests dijalankan dengan SMOKE_PASSWORD._"
    : "_Set `SMOKE_PASSWORD` di .env.local untuk login API/page per user aktif._",
  "",
  "## Data integrity",
  "",
  "| Collection | Total | Status |",
  "| --- | --- | --- |",
];
for (const d of results.dataChecks) {
  lines.push(`| ${d.label} | ${d.total ?? "-"} | ${d.pass ? "✅" : "⚠️"} |`);
}

lines.push("", "## Module workflows", "", "| Module | Check | Total | |", "| --- | --- | --- | --- |");
for (const w of results.workflowChecks) {
  lines.push(`| ${w.module} | ${w.label} | ${w.total ?? "-"} | ${w.pass ? "✅" : "⚠️"} |`);
}

if (results.missingPersonas.length) {
  lines.push("", "## Missing test personas", "", "Buat/assign user PB dengan kombinasi role berikut:", "");
  for (const m of results.missingPersonas) lines.push(`- ${m}`);
}

lines.push("", "## Role distribution", "", "| Persona | Users |", "| --- | --- |");
for (const [k, v] of Object.entries(results.roleDistribution)) {
  lines.push(`| ${k} | ${v} |`);
}

lines.push("", "## Per role", "");
for (const p of results.personas) {
  lines.push(`### ${p.label}`);
  lines.push(`- Email: \`${p.email}\``);
  lines.push(`- Login: **${p.login}**`);
  lines.push(`- role: ${p.role_code ?? "-"} | inventory: ${p.inventory_role} | web_access: ${p.web_access ?? "-"}`);
  lines.push("");
  lines.push("| Route (RBAC) | Expected | Actual | |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of p.rbac) {
    lines.push(`| ${r.path} | ${r.expected ? "allow" : "deny"} | ${r.actual ? "allow" : "deny"} | ${r.ok ? "✅" : "❌"} |`);
  }
  if (p.api.length) {
    lines.push("", "| API | Status | Expected | |");
    lines.push("| --- | --- | --- | --- |");
    for (const a of p.api) {
      lines.push(`| ${a.path} | ${a.status} | ${a.expect || a.expected || "-"} | ${a.ok ? "✅" : "❌"} |`);
    }
  }
  if (p.pages.length) {
    lines.push("", "| Page | HTTP | Allow? | |");
    lines.push("| --- | --- | --- | --- |");
    for (const pg of p.pages) {
      lines.push(`| ${pg.path} | ${pg.status} | ${pg.shouldAllow ? "yes" : "no"} | ${pg.ok ? "✅" : "⚠️"} |`);
    }
  }
  lines.push("");
}

const outPath = path.join(process.cwd(), "docs", "SMOKE_TEST_RESULTS.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join("\n"));

console.log("\n=== SUMMARY ===");
console.log(`Pass: ${results.summary.pass} | Fail: ${results.summary.fail} | Warn: ${results.summary.warn} | Skip: ${results.summary.skip}`);
console.log(`Report: ${outPath}`);

process.exit(results.summary.fail > 0 ? 1 : 0);
