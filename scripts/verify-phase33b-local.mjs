/**
 * Phase 33B local verification — schema + data integrity checks.
 * Run: node scripts/verify-phase33b-local.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://127.0.0.1:8090";

const PHASE33B_COLLECTIONS = [
  "hr_work_schedules",
  "hr_work_schedule_days",
  "hr_employee_work_schedules",
  "work_schedules",
  "work_schedule_days",
  "employee_work_schedules",
];

const PHASE33B_FILES = [
  "docs/PHASE_33B_WORK_SCHEDULE_IMPLEMENTATION_REPORT.md",
  "scripts/test-phase33b-work-schedule.mjs",
  "scripts/migrate-local-hr-phase33b.mjs",
  "lib/hr/work-schedule-calc.ts",
  "lib/hr/work-schedule-server.ts",
];

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const ENV = loadEnv();
const ADMIN_EMAIL = ENV.POCKETBASE_ADMIN_EMAIL || ENV.PB_ADMIN_EMAIL || "";
const ADMIN_PASS = ENV.POCKETBASE_ADMIN_PASSWORD || ENV.PB_ADMIN_PASS || "";

const results = { pass: [], fail: [], skip: [] };

function ok(label) {
  results.pass.push(label);
  console.log(`  ✓ ${label}`);
}
function ng(label, reason) {
  results.fail.push({ label, reason });
  console.error(`  ✗ ${label}${reason ? ` — ${reason}` : ""}`);
}
function skip(label, reason) {
  results.skip.push({ label, reason });
  console.log(`  ⏭ ${label} — ${reason}`);
}

console.log("\n=== Phase 33B Local Verification ===\n");

console.log("1. Implementation artifacts");
{
  let found = 0;
  for (const rel of PHASE33B_FILES) {
    const exists = fs.existsSync(path.join(ROOT, rel));
    if (exists) {
      found++;
      ok(`exists: ${rel}`);
    }
  }
  if (found === 0) {
    ng("Phase 33B implementation files", "none of expected files found in repo");
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const hasTest = Boolean(pkg.scripts?.["test:phase33b-work-schedule"]);
  const hasMigrate = Boolean(pkg.scripts?.["migrate:local-hr-phase33b"]);
  if (hasTest) ok("package.json test:phase33b-work-schedule");
  else ng("package.json test:phase33b-work-schedule", "script missing");
  if (hasMigrate) ok("package.json migrate:local-hr-phase33b");
  else ng("package.json migrate:local-hr-phase33b", "script missing");
}

console.log("\n2. Local PocketBase schema");
if (!ADMIN_EMAIL || !ADMIN_PASS) {
  skip("PB schema check", "admin credentials not in .env.local");
} else {
  try {
    const loginRes = await fetch(`${BASE}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASS }),
    });
    if (!loginRes.ok) {
      ng("PB admin auth", `HTTP ${loginRes.status}`);
    } else {
      ok("PB admin auth");
      const { token } = await loginRes.json();
      const colRes = await fetch(`${BASE}/api/collections?perPage=200`, {
        headers: { Authorization: token },
      });
      const { items } = await colRes.json();
      const names = new Set((items || []).map((i) => i.name));

      let scheduleColFound = false;
      for (const c of PHASE33B_COLLECTIONS) {
        if (names.has(c)) {
          scheduleColFound = true;
          ok(`collection exists: ${c}`);
        }
      }
      if (!scheduleColFound) {
        ng("work schedule collections", "none of expected Phase 33B collections in local PB");
      }

      if (names.has("attendance_logs")) ok("attendance_logs collection preserved");
      else ng("attendance_logs collection", "missing");

      const attRes = await fetch(
        `${BASE}/api/collections/attendance_logs/records?perPage=1&fields=id`,
        { headers: { Authorization: token } },
      );
      if (attRes.ok) {
        const att = await attRes.json();
        ok(`attendance_logs readable (totalItems=${att.totalItems ?? "?"})`);
      } else {
        ng("attendance_logs read", `HTTP ${attRes.status}`);
      }

      const usersCol = (items || []).find((i) => i.name === "users");
      if (usersCol?.updateRule?.includes(":isset = false")) {
        ok("users.updateRule Phase 33A guard present");
      } else {
        ng("users.updateRule Phase 33A", "privilege guard not detected");
      }
    }
  } catch (e) {
    ng("PB connection", e.message);
  }
}

console.log("\n3. Mobile schedule UI");
{
  const panel = fs.readFileSync(
    path.join(ROOT, "mobile/components/attendance/AttendanceCheckInPanel.tsx"),
    "utf8",
  );
  const hasScheduleCard =
    /scheduleCard|scheduleToday|scheduleLabel|scheduleKicker/i.test(panel);
  if (hasScheduleCard) ok("mobile attendance shows schedule context");
  else ng("mobile schedule UI", "no Phase 33B today-schedule display detected in AttendanceCheckInPanel");
}

console.log("\n4. Schedule API routes");
{
  const apiDir = path.join(ROOT, "app/api/hr");
  let scheduleRoutes = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === "route.ts" && p.includes("schedule")) scheduleRoutes.push(p);
    }
  }
  walk(apiDir);
  if (scheduleRoutes.length > 0) {
    for (const r of scheduleRoutes) ok(`API route: ${path.relative(ROOT, r)}`);
  } else {
    ng("schedule API routes", "no app/api/hr/**/schedule/** routes found");
  }
}

console.log(`\n=== Summary: ${results.pass.length} pass, ${results.fail.length} fail, ${results.skip.length} skip ===\n`);

const outPath = path.join(ROOT, "docs", "_phase33b_verify_snapshot.json");
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      pass: results.pass,
      fail: results.fail,
      skip: results.skip,
    },
    null,
    2,
  ),
);
console.log(`Snapshot: docs/_phase33b_verify_snapshot.json`);

process.exit(results.fail.length > 0 ? 1 : 0);
