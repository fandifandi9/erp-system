/**
 * Phase 29B — Verify mobile/.env points at Production backend (hot-reload UAT).
 * Run: node scripts/test-phase29b-mobile-prod-env.mjs
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

console.log("=== Phase 29B Mobile → Production Backend Env ===\n");

const envPath = path.join(ROOT, "mobile/.env");
ok("mobile/.env exists", fs.existsSync(envPath));
const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

ok("ERP = https://serba.space", /EXPO_PUBLIC_ERP_WEB_URL=https:\/\/serba\.space/.test(raw));
ok("PB = https://pb.serba.space", /EXPO_PUBLIC_POCKETBASE_URL=https:\/\/pb\.serba\.space/.test(raw));
ok("no localhost", !/localhost|127\.0\.0\.1/.test(raw));
ok("no staging", !/staging\.serba|pb-staging/.test(raw));
ok("realtime disabled", /EXPO_PUBLIC_PB_DISABLE_REALTIME=true/.test(raw));

const { getPocketBaseUrl, getErpWebUrl, isLoopbackUrl } = await import(
  pathToFileURL(path.join(ROOT, "mobile/lib/env.ts")).href
);
process.env.EXPO_PUBLIC_ERP_WEB_URL = "https://serba.space";
process.env.EXPO_PUBLIC_POCKETBASE_URL = "https://pb.serba.space";
const pb = getPocketBaseUrl();
const erp = getErpWebUrl();
ok("resolver PB host", pb === "https://pb.serba.space", pb);
ok("resolver ERP host", erp === "https://serba.space", erp);
ok("PB not loopback", !isLoopbackUrl(pb));
ok("ERP not loopback", !isLoopbackUrl(erp));

// Production health (read-only)
try {
  const h = await fetch("https://pb.serba.space/api/health");
  ok("Production PB health", h.status === 200, `http=${h.status}`);
} catch (e) {
  ok("Production PB health", false, e.message);
}
try {
  const h = await fetch("https://serba.space/login");
  ok("Production Next.js reachable", h.status === 200, `http=${h.status}`);
} catch (e) {
  ok("Production Next.js reachable", false, e.message);
}

console.log(`\nPASS: ${passed}  FAIL: ${failed}`);
process.exit(failed ? 1 : 0);
