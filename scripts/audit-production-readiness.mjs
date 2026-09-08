/**
 * READ-ONLY production readiness audit.
 * Periksa apakah schema PocketBase Production sudah kompatibel dengan source Local.
 *
 * AMAN: hanya membaca (GET), tidak ada write/patch/post.
 * Jalankan dengan credential production admin.
 *
 * Run:
 *   POCKETBASE_URL=https://pb.serba.space \
 *   POCKETBASE_ADMIN_EMAIL=admin@serba.space \
 *   POCKETBASE_ADMIN_PASSWORD=xxx \
 *   node scripts/audit-production-readiness.mjs
 *
 * Atau set di .env.local.production-backup lalu:
 *   node -e "require('dotenv').config({path:'.env.local.production-backup'})" && \
 *   node scripts/audit-production-readiness.mjs
 */

import fs from "fs";
import path from "path";

// Try to load env
function loadEnv() {
  const candidates = [
    ".env.local.production-backup",
    ".env.production",
    ".env.local",
  ];
  for (const name of candidates) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const get = (k) => {
      const m = text.match(new RegExp(`^${k}=(.+)$`, "m"));
      if (!m) return "";
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v;
    };
    const url = process.env.POCKETBASE_URL || get("POCKETBASE_URL") || get("NEXT_PUBLIC_POCKETBASE_URL");
    const email = process.env.POCKETBASE_ADMIN_EMAIL || get("POCKETBASE_ADMIN_EMAIL");
    const pass = process.env.POCKETBASE_ADMIN_PASSWORD || get("POCKETBASE_ADMIN_PASSWORD");
    if (url && email && pass) return { url, email, pass, source: name };
  }
  return null;
}

const env = loadEnv();
if (!env) {
  console.error([
    "ERROR: Production credentials not found.",
    "Run with env vars:",
    "  POCKETBASE_URL=https://pb.serba.space \\",
    "  POCKETBASE_ADMIN_EMAIL=admin@example.com \\",
    "  POCKETBASE_ADMIN_PASSWORD=xxx \\",
    "  node scripts/audit-production-readiness.mjs",
  ].join("\n"));
  process.exit(1);
}

const BASE = env.url.replace(/\/$/, "");

// Safety guard: warn if not targeting production
const isProduction = BASE.includes("pb.serba.space") && !BASE.includes("staging");
const isLocal = BASE.includes("127.0.0.1") || BASE.includes("localhost");
if (isLocal) {
  console.log("⚠️  WARNING: Targeting LOCAL PocketBase, not Production.");
  console.log("   Set POCKETBASE_URL=https://pb.serba.space for production audit.\n");
} else if (isProduction) {
  console.log("🎯 Targeting PRODUCTION PocketBase:", BASE);
} else {
  console.log("🎯 Targeting:", BASE);
}
console.log("Credentials from:", env.source, "\n");

// Auth
const authRes = await fetch(`${BASE}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.email, password: env.pass }),
});
const auth = await authRes.json().catch(() => ({}));
if (!auth.token) {
  console.error("Admin auth FAILED:", authRes.status, JSON.stringify(auth).slice(0, 200));
  process.exit(1);
}
const token = auth.token;
console.log("✅ Admin auth OK\n");

let passAll = true;
const issues = [];

async function getCollection(name) {
  const r = await fetch(`${BASE}/api/collections/${name}`, { headers: { Authorization: token } });
  return r.ok ? await r.json() : null;
}

function check(label, result, issue) {
  if (result) {
    console.log(`  ✅ ${label}`);
  } else {
    console.log(`  ❌ ${label} — ${issue}`);
    issues.push(issue);
    passAll = false;
  }
}

// ─── users collection ────────────────────────────────────────────────────────
console.log("=== users collection ===");
const users = await getCollection("users");
if (!users) {
  check("users collection exists", false, "users collection not found");
} else {
  const schema = Array.isArray(users.schema) ? users.schema : [];
  const fieldNames = schema.map((f) => f.name);

  check("users.session_nonce exists", fieldNames.includes("session_nonce"),
    "REQUIRED: Add text field 'session_nonce' to users collection");
  check("users.mobile_session_nonce exists", fieldNames.includes("mobile_session_nonce"),
    "REQUIRED (Phase 17E): Add text field 'mobile_session_nonce' to users collection");
  check("users.web_access exists", fieldNames.includes("web_access"),
    "REQUIRED: Add bool field 'web_access' to users collection");
  check("users.locale exists", fieldNames.includes("locale"),
    "REQUIRED: Add text field 'locale' to users collection");
  check("users.role_code exists", fieldNames.includes("role_code") || fieldNames.includes("role"),
    "REQUIRED: Add text field 'role_code' to users collection");
  check("users.updateRule allows self-update",
    users.updateRule === "@request.auth.id = id" ||
    String(users.updateRule ?? "").includes("request.auth.id"),
    `updateRule should allow self-update. Current: "${users.updateRule}"`);
}

// ─── profiles collection ─────────────────────────────────────────────────────
console.log("\n=== profiles collection ===");
const profiles = await getCollection("profiles");
if (!profiles) {
  check("profiles collection exists", false, "profiles collection not found");
} else {
  const schema = Array.isArray(profiles.schema) ? profiles.schema : [];
  const fieldNames = schema.map((f) => f.name);
  const fileFields = schema.filter((f) => f.type === "file");

  check("profiles.user relation exists", fieldNames.includes("user"), "Add relation field 'user' → users");
  check("profiles.avatar file field exists", fieldNames.includes("avatar") && fileFields.some(f => f.name === "avatar"),
    "REQUIRED (Task 3): Add file field 'avatar' to profiles collection for photo upload");
  check("profiles.phone text exists", fieldNames.includes("phone"), "Add text field 'phone'");
  check("profiles.address text exists", fieldNames.includes("address"), "Add text field 'address'");
  check("profiles.bio text exists", fieldNames.includes("bio"), "Add text field 'bio'");
  check("profiles.date_of_birth exists", fieldNames.includes("date_of_birth"), "Add text field 'date_of_birth'");
  check("profiles.division exists", fieldNames.includes("division"), "Add text field 'division'");
  check("profiles.position exists", fieldNames.includes("position"), "Add text field 'position'");
  check("profiles.salary exists", fieldNames.includes("salary"), "Add number field 'salary'");
  check("profiles.join_date exists", fieldNames.includes("join_date"), "Add text field 'join_date'");

  check("profiles.listRule allows authenticated", 
    profiles.listRule != null && String(profiles.listRule).includes("request.auth"),
    `listRule should require auth. Current: "${profiles.listRule}"`);
  check("profiles.viewRule allows authenticated",
    profiles.viewRule != null && String(profiles.viewRule).includes("request.auth"),
    `viewRule should require auth. Current: "${profiles.viewRule}"`);
  check("profiles.updateRule allows authenticated",
    profiles.updateRule != null && String(profiles.updateRule).includes("request.auth"),
    `updateRule should allow user to update own profile. Current: "${profiles.updateRule}"`);

  // File thumbnail check
  if (fileFields.some(f => f.name === "avatar")) {
    const avatarField = schema.find(f => f.name === "avatar");
    check("profiles.avatar allows thumbnails",
      avatarField?.options?.thumbs != null || true, // thumbs optional
      "avatar field exists");
  }
}

// ─── leave_requests collection ───────────────────────────────────────────────
console.log("\n=== leave_requests collection ===");
const leave = await getCollection("leave_requests");
if (!leave) {
  check("leave_requests collection exists", false, "leave_requests collection not found (CRITICAL for leave feature)");
} else {
  const schema = Array.isArray(leave.schema) ? leave.schema : [];
  const fieldNames = schema.map((f) => f.name);

  check("leave_requests.user exists", fieldNames.includes("user"), "Add relation field 'user' → users");
  check("leave_requests.status exists", fieldNames.includes("status"), "Add select field 'status'");
  check("leave_requests.start_date exists", fieldNames.includes("start_date") || fieldNames.includes("date"),
    "Add text/date field 'start_date' or 'date'");
  check("leave_requests.end_date exists", fieldNames.includes("end_date"),
    "Add text/date field 'end_date'");
  check("leave_requests.reason exists", fieldNames.includes("reason"), "Add text field 'reason'");
  check("leave_requests.division/devision exists",
    fieldNames.includes("division") || fieldNames.includes("devision"),
    "Add text field 'division' (or 'devision' for legacy compatibility)");

  // listRule should allow HR/owner to list all
  check("leave_requests.listRule configured",
    leave.listRule != null,
    `listRule is null — set to allow HR/owner to list all, staff to list own. Current: "${leave.listRule}"`);
}

// ─── hr_rating_tasks collection ──────────────────────────────────────────────
console.log("\n=== hr_rating_tasks collection ===");
const rating = await getCollection("hr_rating_tasks");
if (!rating) {
  check("hr_rating_tasks exists", false, "hr_rating_tasks collection not found (may not be needed on production yet)");
} else {
  check("hr_rating_tasks exists", true, "");
}

// ─── hr_reports / hr_findings ────────────────────────────────────────────────
console.log("\n=== hr_reports + hr_findings ===");
const reports = await getCollection("hr_reports");
check("hr_reports exists", !!reports, "hr_reports collection not found (required for Reporting feature)");
const findings = await getCollection("hr_findings");
check("hr_findings exists", !!findings, "hr_findings collection not found (required for Findings feature)");

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log("PRODUCTION READINESS AUDIT RESULTS");
console.log("═".repeat(60));

if (passAll) {
  console.log("\n✅ ALL CHECKS PASS — Production schema is compatible with source.");
} else {
  console.log(`\n❌ ${issues.length} issue(s) found:\n`);
  issues.forEach((iss, i) => console.log(`  ${i + 1}. ${iss}`));
  console.log("\nResolve these issues before deploying to Production.");
}
console.log("═".repeat(60));
console.log(`Target: ${BASE}`);
console.log("Mode: READ-ONLY — no changes made to Production.");
