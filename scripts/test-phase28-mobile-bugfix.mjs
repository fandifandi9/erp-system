/**
 * Phase 28 — Regression tests for production UAT bug fixes.
 * Run: node scripts/test-phase28-mobile-bugfix.mjs
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
  const full = path.join(ROOT, rel);
  return import(pathToFileURL(full).href);
}

console.log("=== Phase 28 Mobile UAT Bugfix Regression ===\n");

// ── 1. Server PB service error sanitization ───────────────────────────────────
console.log("── 1. PB service error sanitization ──");
const pbErr = await loadModule("lib/inventory/pb-service-error.ts");
ok(
  "detects admin login leak",
  pbErr.isSensitivePbServerMessage("Login admin PocketBase gagal: Email atau kata sandi admin salah."),
);
ok(
  "detects POCKETBASE_ADMIN env mention",
  pbErr.isSensitivePbServerMessage("POCKETBASE_ADMIN_EMAIL dan POCKETBASE_ADMIN_PASSWORD wajib"),
);
ok(
  "safe user message passes",
  !pbErr.isSensitivePbServerMessage("Koordinat GPS wajib untuk absensi."),
);
const safe = pbErr.toClientSafeServiceError(
  new Error("Login admin PocketBase gagal: Email atau kata sandi admin salah."),
);
ok("maps sensitive error to PbServiceUnavailableError", safe instanceof pbErr.PbServiceUnavailableError);
ok("safe message has no admin hint", safe && !/admin|password|PocketBase gagal/i.test(safe.message));

// ── 2. hrJsonError client-safe responses (logic mirror) ───────────────────────
console.log("\n── 2. hrJsonError client-safe responses ──");
const sensitiveMsg = "Login admin PocketBase gagal: Email atau kata sandi admin salah.";
const mapped = pbErr.toClientSafeServiceError(new Error(sensitiveMsg));
ok("sensitive maps to 503 class", mapped instanceof pbErr.PbServiceUnavailableError);
ok("mapped message safe", mapped && mapped.status === 503 && !/admin|password/i.test(mapped.message));

// ── 3. Mobile attendance error mapping ────────────────────────────────────────
console.log("\n── 3. Mobile attendance error mapping ──");
const { friendlyAttendanceMessage } = await loadModule("mobile/lib/attendance-ui.ts");
const t = (k) =>
  ({
    "common.error": "Terjadi kesalahan",
    "attendance.serviceUnavailable": "Layanan absensi tidak tersedia",
    "attendance.gpsOutside": "Di luar area kantor",
    "attendance.gpsDenied": "Izin lokasi ditolak",
    "attendance.offline": "Offline",
  })[k] || k;
ok("503 uses service message", friendlyAttendanceMessage("Layanan data sementara tidak tersedia.", t, 503).includes("Layanan data"));
ok("401 → session message", /login/i.test(friendlyAttendanceMessage("x", t, 401)));
ok(
  "admin leak → serviceUnavailable",
  friendlyAttendanceMessage("Login admin PocketBase gagal: x", t) === "Layanan absensi tidak tersedia",
);
ok(
  "GPS outside preserved",
  friendlyAttendanceMessage("Anda berada di luar area kantor.", t) === "Di luar area kantor",
);

// ── 4. Mobile reporting error mapping ─────────────────────────────────────────
console.log("\n── 4. Mobile reporting error mapping ──");
const { mapReportingApiError } = await loadModule("mobile/lib/mobile-api-error.ts");
const tr = (k) => (k === "reporting.serviceUnavailable" ? "LAYANAN TIDAK TERSEDIA" : k);
ok(
  "admin leak → reporting serviceUnavailable",
  mapReportingApiError(new Error("Login admin PocketBase gagal: x"), tr) === "LAYANAN TIDAK TERSEDIA",
);

// ── 5. Mobile source security scan ────────────────────────────────────────────
console.log("\n── 5. Mobile credential leak scan ──");
const mobileDir = path.join(ROOT, "mobile");
const forbidden = [
  /POCKETBASE_ADMIN_EMAIL\s*=/i,
  /POCKETBASE_ADMIN_PASSWORD\s*=/i,
  /process\.env\.POCKETBASE_ADMIN/i,
  /admins\.authWithPassword/i,
];
let leakFiles = [];
function scanDir(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) scanDir(full);
    else if (/\.(ts|tsx|js|json)$/.test(ent.name) && ent.name !== "package-lock.json") {
      const text = fs.readFileSync(full, "utf8");
      for (const re of forbidden) {
        if (re.test(text)) leakFiles.push(`${path.relative(ROOT, full)}: ${re}`);
      }
    }
  }
}
scanDir(mobileDir);
ok("no admin credentials in mobile source", leakFiles.length === 0, leakFiles.join("; ") || "clean");

// ── 6. Production mobile env path (eas.json) ──────────────────────────────────
console.log("\n── 6. Production mobile env (eas.json) ──");
const eas = JSON.parse(fs.readFileSync(path.join(ROOT, "mobile/eas.json"), "utf8"));
const prod = eas.build?.production?.env || {};
ok("production ERP URL", prod.EXPO_PUBLIC_ERP_WEB_URL === "https://serba.space");
ok("production PB URL", prod.EXPO_PUBLIC_POCKETBASE_URL === "https://pb.serba.space");
ok("no localhost in production profile", !JSON.stringify(prod).includes("localhost"));
ok("no staging in production profile", !JSON.stringify(prod).includes("staging.serba"));

console.log(`\n══════════════════════════════════════════`);
console.log(`Phase 28 Bugfix Tests: ${passed + failed} total`);
console.log(`  PASS: ${passed}`);
console.log(`  FAIL: ${failed}`);
console.log(`Status: ${failed === 0 ? "PASS" : "FAIL"}`);
process.exit(failed === 0 ? 0 : 1);
