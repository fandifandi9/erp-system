/**
 * Phase 29 — Mobile local UAT regression (error UX + UI helpers).
 * Run: node scripts/test-phase29-mobile-uat.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function loadModule(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

console.log("=== Phase 29 Mobile Local UAT Regression ===\n");

// ── 1. Centralized error sanitization ─────────────────────────────────────────
console.log("── 1. User-facing error sanitization ──");
const { sanitizeUserFacingMessage, getErrorMessage } = await loadModule("mobile/lib/errors.ts");

ok(
  "strips PocketBase admin leak",
  sanitizeUserFacingMessage("Login admin PocketBase gagal: x", "Aman") === "Aman",
);
ok(
  "strips HTTP status codes",
  sanitizeUserFacingMessage("HTTP 500", "Aman") === "Aman",
);
ok(
  "strips EXPO_PUBLIC env names",
  sanitizeUserFacingMessage("EXPO_PUBLIC_ERP_WEB_URL missing", "Aman") === "Aman",
);
ok(
  "preserves business validation",
  sanitizeUserFacingMessage("Sudah absen masuk hari ini.", "Aman") === "Sudah absen masuk hari ini.",
);
ok(
  "getErrorMessage uses fallback for technical",
  getErrorMessage(new Error("POCKETBASE_ADMIN_EMAIL invalid"), "Fallback") === "Fallback",
);

// ── 2. Attendance panel sticky footer architecture ────────────────────────────
console.log("\n── 2. Attendance sticky footer ──");
const attPanel = fs.readFileSync(
  path.join(ROOT, "mobile/components/attendance/AttendanceCheckInPanel.tsx"),
  "utf8",
);
ok("attendance uses root flex container", /styles\.root/.test(attPanel));
ok("attendance has stickyFooter style", /styles\.stickyFooter/.test(attPanel));
ok("check-in button outside sole ScrollView close", /stickyFooter[\s\S]*onCheckIn/.test(attPanel));

// ── 3. Reporting form sticky submit ─────────────────────────────────────────
console.log("\n── 3. Reporting form sticky submit ──");
const caseForm = fs.readFileSync(path.join(ROOT, "mobile/components/reporting/MobileCaseForm.tsx"), "utf8");
ok("case form has sticky footer", /styles\.stickyFooter/.test(caseForm));
ok("submit in footer not only in scroll", /stickyFooter[\s\S]*submit\(\)/.test(caseForm));
ok("error banner component", /styles\.errBanner/.test(caseForm));

// ── 4. Case detail empty evidence state ─────────────────────────────────────
console.log("\n── 4. Case detail empty evidence ──");
const caseDetail = fs.readFileSync(path.join(ROOT, "mobile/components/reporting/MobileCaseDetail.tsx"), "utf8");
ok("empty evidence state", /styles\.emptyAtt/.test(caseDetail));
ok("error state with icon", /alert-circle-outline/.test(caseDetail));

// ── 5. Profile sticky save (Phase 28 carry-over) ──────────────────────────────
console.log("\n── 5. Profile sticky save ──");
const profile = fs.readFileSync(path.join(ROOT, "mobile/app/(tabs)/profile.tsx"), "utf8");
ok("profile sticky footer", /styles\.stickyFooter/.test(profile));
ok("save button in footer", /Simpan perubahan/.test(profile));

// ── 6. Auth messages — no PocketBase jargon ─────────────────────────────────
console.log("\n── 6. Auth user messages ──");
const auth = fs.readFileSync(path.join(ROOT, "mobile/context/auth.tsx"), "utf8");
ok("no PocketBase in session error", !/izinkan update sendiri di PocketBase/.test(auth));
ok("no PocketBase in MFA error", !/Periksa email atau PocketBase/.test(auth));

// ── 7. Security scan (carry-over) ─────────────────────────────────────────────
console.log("\n── 7. Mobile credential leak scan ──");
const forbidden = [
  /POCKETBASE_ADMIN_EMAIL\s*=/i,
  /POCKETBASE_ADMIN_PASSWORD\s*=/i,
  /admins\.authWithPassword/i,
];
let leaks = [];
function scanDir(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) scanDir(full);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const re of forbidden) {
        if (re.test(text)) leaks.push(path.relative(ROOT, full));
      }
    }
  }
}
scanDir(path.join(ROOT, "mobile"));
ok("no admin credentials in mobile", leaks.length === 0, leaks.join("; ") || "clean");

// ── 8. Login session-nonce race guard (Phase 29A) ─────────────────────────────
console.log("\n── 8. Login session-nonce race guard ──");
const authCtx = fs.readFileSync(path.join(ROOT, "mobile/context/auth.tsx"), "utf8");
ok("sessionSetupRef blocks verify during login", /sessionSetupRef\.current/.test(authCtx));
ok("clear nonce before password auth", /clearMobileSessionNonce\(\)[\s\S]*authWithPassword/.test(authCtx));
ok("verify skips during session setup", /if \(sessionSetupRef\.current\) return/.test(authCtx));

// ── 9. Local env helpers ──────────────────────────────────────────────────────
console.log("\n── 9. Local env helpers ──");
const { isStagingOrProductionMobileUrl, getMobileEnvHostDiagnostics } = await loadModule(
  "mobile/lib/env.ts",
);
const prevPb = process.env.EXPO_PUBLIC_POCKETBASE_URL;
const prevErp = process.env.EXPO_PUBLIC_ERP_WEB_URL;
process.env.EXPO_PUBLIC_POCKETBASE_URL = "http://192.168.2.176:8090";
process.env.EXPO_PUBLIC_ERP_WEB_URL = "http://192.168.2.176:3000";
ok("LAN URLs not staging/prod", !isStagingOrProductionMobileUrl());
process.env.EXPO_PUBLIC_POCKETBASE_URL = "https://pb-staging.serba.space";
process.env.EXPO_PUBLIC_ERP_WEB_URL = "https://staging.serba.space";
ok("detects staging URLs", isStagingOrProductionMobileUrl());
process.env.EXPO_PUBLIC_POCKETBASE_URL = prevPb || "";
process.env.EXPO_PUBLIC_ERP_WEB_URL = prevErp || "";
const diag = getMobileEnvHostDiagnostics();
ok("env diagnostics expose hosts only", typeof diag.pocketBaseHost === "string");

// ── 10. mobile/.env backend (Phase 29A LAN or 29B Production) ────────────────
console.log("\n── 10. mobile/.env backend URLs ──");
const mobileEnvPath = path.join(ROOT, "mobile/.env");
if (fs.existsSync(mobileEnvPath)) {
  const mobileEnv = fs.readFileSync(mobileEnvPath, "utf8");
  const isLan =
    /EXPO_PUBLIC_ERP_WEB_URL=http:\/\/192\.168\./.test(mobileEnv) &&
    /EXPO_PUBLIC_POCKETBASE_URL=http:\/\/192\.168\./.test(mobileEnv);
  const isProd =
    /EXPO_PUBLIC_ERP_WEB_URL=https:\/\/serba\.space/.test(mobileEnv) &&
    /EXPO_PUBLIC_POCKETBASE_URL=https:\/\/pb\.serba\.space/.test(mobileEnv);
  ok("mobile/.env LAN or Production backend", isLan || isProd, isLan ? "LAN" : isProd ? "Production" : "unknown");
  ok("mobile/.env no localhost", !/localhost|127\.0\.0\.1/.test(mobileEnv));
  ok("mobile/.env not staging", !/staging\.serba|pb-staging/.test(mobileEnv));
} else {
  ok("mobile/.env exists", false, "missing");
}

console.log(`\n══════════════════════════════════════════`);
console.log(`Phase 29 Mobile UAT Tests: ${passed + failed} total`);
console.log(`  PASS: ${passed}`);
console.log(`  FAIL: ${failed}`);
console.log(`Status: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
