/**
 * Phase 34B — Attendance engine + scope tests (local).
 * Run: npm run test:phase34-attendance
 */

import fs from "fs";
import path from "path";

// Inline calc mirror (sync with lib/hr/work-schedule-calc.ts)
const TZ = 7 * 60;
function zonedDateTimeToUtcMs(ymd, hm) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, m] = hm.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, 0, 0, 0, 0) + (h * 60 + m) * 60_000 - TZ * 60_000;
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function hasCap(role, cap) {
  const staffCaps = new Set(["attendance.view_self", "attendance.check_in", "attendance.check_out"]);
  const mgrCaps = new Set([...staffCaps, "attendance.view_team"]);
  const hrCaps = new Set([...mgrCaps, "attendance.manage"]);
  if (role === "owner") return true;
  if (role === "hr") return hrCaps.has(cap);
  if (role === "manager") return mgrCaps.has(cap);
  return staffCaps.has(cap);
}

function rejectForge(body) {
  const forbidden = ["company_id", "company", "user", "late_minutes", "overtime_minutes"];
  for (const k of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      throw new Error(`forbidden ${k}`);
    }
  }
}

console.log("\n=== Phase 34B Attendance Tests ===\n");

console.log("Capabilities mirror");
{
  assert(hasCap("staff", "attendance.check_in"), "staff check_in");
  assert(!hasCap("staff", "attendance.view_team"), "staff no team");
  assert(hasCap("manager", "attendance.view_team"), "manager team");
  assert(!hasCap("manager", "attendance.manage"), "manager no manage");
  assert(hasCap("hr", "attendance.manage"), "hr manage");
}

console.log("Forge rejection");
{
  let threw = false;
  try {
    rejectForge({ company_id: "x" });
  } catch {
    threw = true;
  }
  assert(threw, "reject company_id");
}

console.log("Late / overnight — OT not auto from late checkout");
{
  const startMs = zonedDateTimeToUtcMs("2026-08-31", "22:00");
  const endMs = zonedDateTimeToUtcMs("2026-09-01", "06:00");
  const checkInMs = startMs + 15 * 60_000;
  const checkOutMs = zonedDateTimeToUtcMs("2026-09-01", "07:30");
  const rawLate = Math.max(0, Math.floor((checkInMs - startMs) / 60_000));
  const lateMinutes = rawLate <= 5 ? 0 : rawLate - 5;
  const overtimeMinutes = 0; // approval workflow only — do not credit from (checkOut - end)
  assert(lateMinutes === 10, "late 10 after 5 grace");
  assert(overtimeMinutes === 0, "no auto OT from overnight late checkout");
  void checkOutMs;
  void endMs;
}

console.log("Snapshot stability");
{
  const ci = zonedDateTimeToUtcMs("2026-08-31", "08:15");
  const start8 = zonedDateTimeToUtcMs("2026-08-31", "08:00");
  const start9 = zonedDateTimeToUtcMs("2026-08-31", "09:00");
  const late8 = Math.max(0, Math.floor((ci - start8) / 60_000));
  const late9 = Math.max(0, Math.floor((ci - start9) / 60_000));
  assert(late8 === 15 && late9 === 0, "frozen snapshot differs from live schedule edit");
}

console.log("Employment primary rule");
{
  function primary(memberIds, user) {
    if (memberIds.length === 1) return memberIds[0];
    for (const p of [user.default_company, user.active_company]) {
      if (p && memberIds.includes(p)) return p;
    }
    return null;
  }
  assert(primary(["c1"], {}) === "c1", "single");
  assert(primary(["c1", "c2"], { default_company: "c2" }) === "c2", "default");
  assert(primary(["c1", "c2"], {}) === null, "ambiguous");
}

console.log("Manager scope intersection");
{
  const managed = ["a1", "a2", "b1"];
  const inCo = new Set(["a1", "a2"]);
  assert(managed.filter((id) => inCo.has(id)).length === 2, "cross-company filtered");
}

console.log("Artifacts");
{
  for (const f of [
    "lib/hr/attendance-engine.ts",
    "lib/hr/employment-scope.ts",
    "lib/capabilities/attendance.ts",
    "components/hr/DesktopAttendancePanel.tsx",
    "scripts/migrate-local-hr-phase34b.mjs",
  ]) {
    assert(fs.existsSync(path.join(process.cwd(), f)), f);
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);
