/**
 * scripts/test-phase33b-work-schedule.mjs
 * Phase 33B — Work schedule, shift calc, RBAC, live PB tests.
 *
 * Run: npm run test:phase33b-work-schedule
 */

import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

// ─── Inline calc mirror (lib/hr/work-schedule-calc.ts) ───────────────────────

const DEFAULT_TZ = "Asia/Jakarta";
const TZ_OFFSET = { "Asia/Jakarta": 420 };

function parseHm(hm) {
  const m = String(hm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function zonedToUtc(ymd, hm, tz = DEFAULT_TZ) {
  const mins = parseHm(hm);
  if (mins === null) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const off = TZ_OFFSET[tz] ?? 420;
  return Date.UTC(y, mo - 1, d, 0, 0, 0) + mins * 60_000 - off * 60_000;
}

function isOvernight(s, e) {
  const a = parseHm(s);
  const b = parseHm(e);
  return a !== null && b !== null && b <= a;
}

function computeMetrics(input) {
  const businessDate = input.businessDate.slice(0, 10);
  if (input.isWorkingDay === false) {
    return { status: "off_day", lateMinutes: 0, overtimeMinutes: 0, isOvernight: false };
  }
  if (!input.scheduledStart || !input.scheduledEnd) {
    return { status: "schedule_not_assigned", lateMinutes: 0, overtimeMinutes: 0, isOvernight: false };
  }
  const overnight = isOvernight(input.scheduledStart, input.scheduledEnd);
  const startMs = zonedToUtc(businessDate, input.scheduledStart, input.timezone);
  let endYmd = businessDate;
  if (overnight) {
    const [y, mo, d] = businessDate.split("-").map(Number);
    endYmd = new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
  }
  const endMs = zonedToUtc(endYmd, input.scheduledEnd, input.timezone);
  const grace = Math.max(0, input.lateGraceMinutes ?? 0);
  const earlyGrace = Math.max(0, input.earlyLeaveGraceMinutes ?? 0);
  const ci = input.actualCheckIn ? new Date(input.actualCheckIn).getTime() : null;
  const co = input.actualCheckOut ? new Date(input.actualCheckOut).getTime() : null;
  if (!ci) return { status: "incomplete", lateMinutes: 0, overtimeMinutes: 0, isOvernight: overnight };
  const rawLate = Math.max(0, Math.floor((ci - startMs) / 60_000));
  const lateMinutes = rawLate <= grace ? 0 : rawLate - grace;
  const status = lateMinutes > 0 ? "late" : "present";
  let overtimeMinutes = 0;
  let earlyLeaveMinutes = 0;
  if (co) {
    const rawEarly = Math.max(0, Math.floor((endMs - co) / 60_000));
    earlyLeaveMinutes = rawEarly <= earlyGrace ? 0 : rawEarly - earlyGrace;
    // OT not auto-credited from late checkout (approval/assignment only).
  }
  return { status, lateMinutes, earlyLeaveMinutes, overtimeMinutes, isOvernight: overnight };
}

// ─── Schedule capabilities mirror ────────────────────────────────────────────

function hasScheduleCap(user, cap) {
  if (!user) return false;
  if (user.account_type === "owner" || user.role === "owner") return true;
  if (user.role_code === "hr" || user.role === "hr") {
    return ["schedule.view", "schedule.create", "schedule.update", "schedule.assign", "schedule.manage"].includes(cap);
  }
  if (user.role_code === "manager") return cap === "schedule.view";
  if (cap === "schedule.view") return true;
  return false;
}

function datesOverlap(aFrom, aTo, bFrom, bTo) {
  const at = aTo ? aTo.slice(0, 10) : "9999-12-31";
  const bt = bTo ? bTo.slice(0, 10) : "9999-12-31";
  return aFrom.slice(0, 10) <= bt && bFrom.slice(0, 10) <= at;
}

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  };
  return {
    url: get("NEXT_PUBLIC_POCKETBASE_URL").replace(/\/$/, ""),
    email: get("POCKETBASE_ADMIN_EMAIL"),
    pass: get("POCKETBASE_ADMIN_PASSWORD"),
    smokePass: get("SMOKE_PASSWORD") || "SerbaSmoke2026!",
    smokeDomain: get("SMOKE_EMAIL_DOMAIN") || "serba.test",
  };
}

console.log("\n=== Phase 33B Work Schedule Tests ===\n");

console.log("Calculation — normal + grace");
{
  const m1 = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "08:00",
    scheduledEnd: "17:00",
    actualCheckIn: zonedToUtc("2026-08-20", "08:07", DEFAULT_TZ),
    actualCheckOut: zonedToUtc("2026-08-20", "17:00", DEFAULT_TZ),
    lateGraceMinutes: 10,
    timezone: DEFAULT_TZ,
  });
  assert(m1.status === "present" && m1.lateMinutes === 0, "08:07 with 10m grace → present");

  const m2 = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "08:00",
    scheduledEnd: "17:00",
    actualCheckIn: zonedToUtc("2026-08-20", "08:15", DEFAULT_TZ),
    lateGraceMinutes: 10,
    timezone: DEFAULT_TZ,
  });
  assert(m2.status === "late" && m2.lateMinutes === 5, "08:15 with 10m grace → late 5m");
}

console.log("Calculation — overtime never auto from late checkout");
{
  const m = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "08:00",
    scheduledEnd: "17:00",
    actualCheckIn: zonedToUtc("2026-08-20", "08:00", DEFAULT_TZ),
    actualCheckOut: zonedToUtc("2026-08-20", "17:30", DEFAULT_TZ),
    timezone: DEFAULT_TZ,
  });
  assert(m.overtimeMinutes === 0, "checkout past end → OT still 0 (approval workflow only)");
}

console.log("Calculation — overnight 22:00–06:00");
{
  const m = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "22:00",
    scheduledEnd: "06:00",
    actualCheckIn: zonedToUtc("2026-08-20", "21:55", DEFAULT_TZ),
    actualCheckOut: zonedToUtc("2026-08-21", "06:10", DEFAULT_TZ),
    lateGraceMinutes: 5,
    timezone: DEFAULT_TZ,
  });
  assert(m.isOvernight === true, "22-06 is overnight");
  assert(m.overtimeMinutes === 0, "overnight late checkout → OT 0 (not auto)");
  assert(m.status === "present", "early check-in within grace");
}

console.log("Calculation — off day");
{
  const m = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "08:00",
    scheduledEnd: "17:00",
    isWorkingDay: false,
  });
  assert(m.status === "off_day", "off day status");
}

console.log("Calculation — employee scenarios A/B/C");
{
  const a = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "08:00",
    scheduledEnd: "17:00",
    actualCheckIn: zonedToUtc("2026-08-20", "08:20", DEFAULT_TZ),
    lateGraceMinutes: 10,
    timezone: DEFAULT_TZ,
  });
  assert(a.lateMinutes === 10, "Employee A late 10");

  const b = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "09:00",
    scheduledEnd: "18:00",
    actualCheckIn: zonedToUtc("2026-08-20", "08:55", DEFAULT_TZ),
    lateGraceMinutes: 5,
    timezone: DEFAULT_TZ,
  });
  assert(b.status === "present", "Employee B on time");

  const c = computeMetrics({
    businessDate: "2026-08-20",
    scheduledStart: "22:00",
    scheduledEnd: "06:00",
    actualCheckIn: zonedToUtc("2026-08-20", "22:05", DEFAULT_TZ),
    actualCheckOut: zonedToUtc("2026-08-21", "06:00", DEFAULT_TZ),
    lateGraceMinutes: 10,
    timezone: DEFAULT_TZ,
  });
  assert(c.isOvernight && c.lateMinutes === 0, "Employee C overnight present");
}

console.log("Effective date overlap detection");
{
  assert(datesOverlap("2026-08-01", "2026-08-31", "2026-08-15", null), "overlapping ranges");
  assert(!datesOverlap("2026-08-01", "2026-08-31", "2026-09-01", null), "non-overlapping");
}

console.log("RBAC — schedule capabilities");
{
  assert(!hasScheduleCap({ role_code: "staff" }, "schedule.create"), "staff cannot create");
  assert(!hasScheduleCap({ role_code: "staff" }, "schedule.assign"), "staff cannot assign");
  assert(hasScheduleCap({ role_code: "staff" }, "schedule.view"), "staff can view own");
  assert(hasScheduleCap({ role_code: "hr" }, "schedule.assign"), "HR can assign");
  assert(!hasScheduleCap({ role_code: "manager" }, "schedule.create"), "manager cannot create");
  assert(hasScheduleCap({ role_code: "manager" }, "schedule.view"), "manager can view");
  assert(hasScheduleCap({ account_type: "owner" }, "schedule.manage"), "owner full manage");
}

console.log("Implementation artifacts");
{
  const files = [
    "lib/hr/work-schedule-calc.ts",
    "lib/hr/work-schedule-server.ts",
    "lib/capabilities/schedule.ts",
    "scripts/migrate-local-hr-phase33b.mjs",
    "app/api/hr/work-schedules/route.ts",
  ];
  for (const f of files) assert(fs.existsSync(path.join(process.cwd(), f)), `exists ${f}`);
}

const env = loadEnv();
const isLocal = env.url && !env.url.includes("serba.space") && !env.url.includes(":8091");

if (!isLocal) {
  console.log("\nLive PB tests SKIPPED (not local)");
} else {
  console.log("\nLive PocketBase schema + functional");

  async function pb(method, suffix, body, token) {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = token;
    const r = await fetch(`${env.url}${suffix}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }

  const auth = await pb("POST", "/api/admins/auth-with-password", { identity: env.email, password: env.pass });
  if (!auth.data?.token) {
    console.log("  ⚠ SKIP live — admin auth failed (run migrate:local-hr-phase33b)");
  } else {
    const token = auth.data.token;
    for (const name of ["hr_work_schedules", "hr_work_schedule_days", "hr_employee_work_schedules"]) {
      const col = await pb("GET", `/api/collections/${name}`, null, token);
      assert(col.status === 200 && col.data?.name === name, `collection ${name} exists`);
    }

    const companies = await pb("GET", "/api/collections/biz_company_profile/records?perPage=1", null, token);
    const companyId = companies.data?.items?.[0]?.id;
    if (!companyId) {
      console.log("  ⚠ SKIP schedule CRUD — no company");
    } else {
      const code = `p33b-${Date.now()}`;
      const created = await pb(
        "POST",
        "/api/collections/hr_work_schedules/records",
        {
          company: companyId,
          name: `Test Schedule ${code}`,
          code,
          schedule_type: "shift",
          timezone: "Asia/Jakarta",
          effective_from: "2026-08-01",
          is_active: true,
          late_grace_minutes: 10,
          early_leave_grace_minutes: 5,
        },
        token,
      );
      assert(created.status === 200 || created.status === 201, "create schedule via admin");
      const scheduleId = created.data?.id;
      if (scheduleId) {
        await pb(
          "POST",
          "/api/collections/hr_work_schedule_days/records",
          {
            schedule: scheduleId,
            weekday: 1,
            start_time: "09:00",
            end_time: "18:00",
            is_working_day: true,
          },
          token,
        );
        await pb(
          "POST",
          "/api/collections/hr_work_schedule_days/records",
          {
            schedule: scheduleId,
            weekday: 0,
            is_working_day: false,
          },
          token,
        );

        const staffEmail = `smoke-employee@${env.smokeDomain}`;
        const staffList = await pb(
          "GET",
          `/api/collections/users/records?filter=${encodeURIComponent(`email="${staffEmail}"`)}`,
          null,
          token,
        );
        const staffId = staffList.data?.items?.[0]?.id;
        if (staffId) {
          const assign = await pb(
            "POST",
            "/api/collections/hr_employee_work_schedules/records",
            {
              user: staffId,
              schedule: scheduleId,
              effective_from: "2026-08-01",
              is_active: true,
            },
            token,
          );
          assert(assign.status === 200 || assign.status === 201, "assign schedule to employee");

          const staffAuth = await pb("POST", "/api/collections/users/auth-with-password", {
            identity: staffEmail,
            password: env.smokePass,
          });
          if (staffAuth.data?.token) {
            const denyCreate = await pb(
              "POST",
              "/api/collections/hr_work_schedules/records",
              { company: companyId, name: "Hack" },
              staffAuth.data.token,
            );
            assert(
              denyCreate.status !== 200 && denyCreate.status !== 201,
              `staff cannot create schedule via PB (got ${denyCreate.status})`,
            );
          } else {
            console.log("  ⚠ SKIP staff PB deny — smoke employee login failed");
          }
        }
      }
    }

    const att = await pb("GET", "/api/collections/attendance_logs/records?perPage=1&fields=id", null, token);
    assert(att.status === 200, "attendance_logs still readable");
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
