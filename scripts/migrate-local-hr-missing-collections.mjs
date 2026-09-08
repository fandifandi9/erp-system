/**
 * LOCAL-ONLY: buat / patch koleksi HR yang hilang di PocketBase lokal (:8090).
 * Termasuk jadwal kerja, libur kantor, kuota divisi, kompensasi, lembur, aktivitas lapangan,
 * serta field attendance & leave yang belum dimigrasi dari staging.
 *
 * Run: node scripts/migrate-local-hr-missing-collections.mjs
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
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
  };
}

const HR_OR_OWNER =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

const HR_WRITE_RULES = {
  listRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  viewRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
};

const HR_OWNER_DELETE = {
  ...HR_WRITE_RULES,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

const OFFICE_HOLIDAYS_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
};

const LEAVE_LIST_VIEW = `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`;

const ATTENDANCE_LOGS_RULES = {
  listRule: LEAVE_LIST_VIEW,
  viewRule: LEAVE_LIST_VIEW,
  createRule: '@request.auth.id != "" && user = @request.auth.id',
  updateRule: LEAVE_LIST_VIEW,
  deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
};

const OVERTIME_RULES = {
  listRule: LEAVE_LIST_VIEW,
  viewRule: LEAVE_LIST_VIEW,
  createRule: '@request.auth.id != ""',
  updateRule: '@request.auth.id != ""',
  deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
};

const FIELD_ACTIVITY_RULES = {
  listRule: LEAVE_LIST_VIEW,
  viewRule: LEAVE_LIST_VIEW,
  createRule: '@request.auth.id != "" && @request.data.user = @request.auth.id',
  updateRule: `@request.auth.id != "" && ((user = @request.auth.id && status = "pending_hr") || ${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
};

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function numberField(name, required = false) {
  return { name, type: "number", required, system: false, options: { min: null, max: null, noDecimal: false } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function dateField(name, required = false) {
  return { name, type: "date", required, system: false, options: { min: "", max: "" } };
}
function selectField(name, values, required = false) {
  return { name, type: "select", required, system: false, options: { maxSelect: 1, values } };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function fileField(name) {
  return {
    name,
    type: "file",
    required: false,
    system: false,
    options: {
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      thumbs: [],
    },
  };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  for (const f of extras) {
    if (!names.has(f.name)) next.push(f);
  }
  return next;
}

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function ensureCollection(token, name, schema, rules) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (existing.ok && existing.data?.id) {
    const col = existing.data;
    col.schema = ensureFields(col.schema, schema);
    if (rules) Object.assign(col, rules);
    const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
    if (!patch.ok) throw new Error(`PATCH ${name} failed: ${JSON.stringify(patch.data).slice(0, 400)}`);
    console.log(`  ✓ ${name} (patched)`);
    return col.id;
  }
  const create = await pbJson(
    "POST",
    "/api/collections",
    { name, type: "base", schema, ...(rules || {}) },
    token,
  );
  if (!create.ok) throw new Error(`CREATE ${name} failed: ${JSON.stringify(create.data).slice(0, 400)}`);
  console.log(`  ✓ ${name} (created)`);
  return create.data.id;
}

async function seedIfEmpty(token, collection, filter, record) {
  const q = filter ? `?filter=${encodeURIComponent(filter)}&perPage=1` : "?perPage=1";
  const list = await pbJson("GET", `/api/collections/${collection}/records${q}`, null, token);
  if (!list.ok) {
    console.log(`  ⚠ seed skip ${collection}: ${list.status}`);
    return;
  }
  if ((list.data?.items?.length ?? 0) > 0) {
    console.log(`  · ${collection} already has data`);
    return;
  }
  const created = await pbJson("POST", `/api/collections/${collection}/records`, record, token);
  if (!created.ok) {
    console.log(`  ⚠ seed ${collection} failed: ${JSON.stringify(created.data).slice(0, 200)}`);
    return;
  }
  console.log(`  ✓ ${collection} seeded default record`);
}

console.log("Target:", url);

const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
if (!auth.data?.token) {
  console.error("Admin auth failed", auth.status);
  process.exit(1);
}
const token = auth.data.token;
console.log("Admin auth OK\n");

const usersRes = await pbJson("GET", "/api/collections/users", null, token);
if (!usersRes.ok) {
  console.error("GET users failed");
  process.exit(1);
}
const usersId = usersRes.data.id;

// users — field operasional check-in
{
  const users = usersRes.data;
  users.schema = ensureFields(users.schema, [
    boolField("is_checked_in"),
    boolField("shift_active"),
    boolField("web_access"),
    textField("last_checkin"),
    textField("last_checkout"),
  ]);
  const patch = await pbJson("PATCH", "/api/collections/users", users, token);
  if (!patch.ok) console.warn("PATCH users operational fields:", JSON.stringify(patch.data).slice(0, 200));
  else console.log("✓ users operational fields");
}

console.log("\n--- Work calendar & holidays ---");
await ensureCollection(
  token,
  "work_calendar_settings",
  [
    textField("name"),
    boolField("is_active"),
    boolField("work_sunday"),
    boolField("work_monday"),
    boolField("work_tuesday"),
    boolField("work_wednesday"),
    boolField("work_thursday"),
    boolField("work_friday"),
    boolField("work_saturday"),
  ],
  HR_WRITE_RULES,
);
await seedIfEmpty(token, "work_calendar_settings", "is_active=true", {
  name: "Default",
  is_active: true,
  work_sunday: true,
  work_monday: true,
  work_tuesday: true,
  work_wednesday: true,
  work_thursday: true,
  work_friday: true,
  work_saturday: true,
});

await ensureCollection(
  token,
  "office_holidays",
  [dateField("date", true), textField("name"), boolField("is_active")],
  OFFICE_HOLIDAYS_RULES,
);

console.log("\n--- Leave quotas & compensation ---");
await ensureCollection(
  token,
  "division_quotas",
  [textField("division", true), numberField("max_people_per_day", true)],
  HR_WRITE_RULES,
);
for (const row of [
  { division: "IT", max_people_per_day: 2 },
  { division: "Marketing", max_people_per_day: 2 },
  { division: "Sales", max_people_per_day: 3 },
  { division: "Finance", max_people_per_day: 2 },
  { division: "HR", max_people_per_day: 2 },
]) {
  const f = `division = "${row.division}"`;
  await seedIfEmpty(token, "division_quotas", f, row);
}

await ensureCollection(
  token,
  "hr_compensation_settings",
  [
    textField("name", true),
    boolField("is_active"),
    numberField("overtime_hourly_rate", true),
    numberField("overtime_multiplier", true),
    numberField("leave_daily_compensation_rate", true),
  ],
  HR_OWNER_DELETE,
);
await seedIfEmpty(token, "hr_compensation_settings", "is_active=true", {
  name: "Default",
  is_active: true,
  overtime_hourly_rate: 50000,
  overtime_multiplier: 1.5,
  leave_daily_compensation_rate: 100000,
});

console.log("\n--- Overtime & field activity ---");
await ensureCollection(
  token,
  "overtime_requests",
  [
    relationField("user", usersId, true),
    dateField("work_date", true),
    textField("start_time", true),
    textField("end_time", true),
    numberField("hours"),
    selectField("source", ["hr_assignment", "staff_request"], true),
    selectField(
      "status",
      ["waiting_staff", "waiting_hr", "staff_accepted", "staff_declined", "hr_approved", "hr_rejected"],
      true,
    ),
    textField("reason", true),
    textField("hr_note"),
    textField("rejection_reason"),
    textField("staff_decline_note"),
    textField("created_by"),
    textField("hr_action_by"),
    textField("hr_action_name"),
    textField("hr_action_at"),
    numberField("hourly_rate"),
    numberField("pay_amount"),
    numberField("overtime_multiplier"),
  ],
  OVERTIME_RULES,
);

await ensureCollection(
  token,
  "field_activity_requests",
  [
    relationField("user", usersId, true),
    dateField("start_date", true),
    dateField("end_date", true),
    selectField("activity_type", ["meeting", "visit", "out_of_town", "other"], true),
    textField("destination", true),
    textField("reason", true),
    selectField("status", ["pending_hr", "approved", "rejected", "cancelled"], true),
    textField("rejection_reason"),
    textField("hr_action_by"),
    textField("hr_action_name"),
    textField("hr_action_at"),
  ],
  FIELD_ACTIVITY_RULES,
);

console.log("\n--- Attendance ---");
await ensureCollection(
  token,
  "attendance_settings",
  [numberField("max_late_minutes"), textField("allow_remote"), textField("gps_required")],
  HR_WRITE_RULES,
);
await seedIfEmpty(token, "attendance_settings", "", {
  max_late_minutes: 15,
  allow_remote: "false",
  gps_required: "true",
});

await ensureCollection(
  token,
  "attendance_logs",
  [
    relationField("user", usersId, false),
    dateField("date"),
    dateField("check_in"),
    dateField("check_out"),
    textField("status"),
    numberField("late_minutes"),
    numberField("work_hours"),
    numberField("lat"),
    numberField("lng"),
    numberField("distance_meter"),
    textField("device_id"),
    textField("ip_address"),
    boolField("is_suspicious"),
    fileField("check_in_selfie"),
  ],
  ATTENDANCE_LOGS_RULES,
);

console.log("\n--- Leave requests (patch fields + rules) ---");
const leaveFields = [
  relationField("user", usersId, false),
  dateField("start_date", true),
  dateField("end_date", true),
  textField("reason", true),
  textField("division", true),
  textField("position", true),
  dateField("booking_date", true),
  textField("rejection_reason"),
  textField("hr_action_by"),
  textField("hr_action_name"),
  textField("hr_action_at"),
  selectField("status", ["pending", "approved", "rejected", "cancelled"], true),
  // legacy — tetap ada agar data lama tidak hilang
  dateField("date"),
  textField("note"),
  textField("devision"),
];
const leaveRes = await pbJson("GET", "/api/collections/leave_requests", null, token);
if (leaveRes.ok) {
  const col = leaveRes.data;
  col.schema = ensureFields(col.schema, leaveFields);
  col.listRule = LEAVE_LIST_VIEW;
  col.viewRule = LEAVE_LIST_VIEW;
  col.createRule = '@request.auth.id != "" && user = @request.auth.id';
  col.updateRule = LEAVE_LIST_VIEW;
  col.deleteRule = `@request.auth.id != "" && (${HR_OR_OWNER})`;
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, col, token);
  if (!patch.ok) console.warn("PATCH leave_requests:", JSON.stringify(patch.data).slice(0, 300));
  else console.log("  ✓ leave_requests patched");
} else {
  await ensureCollection(token, "leave_requests", leaveFields, {
    listRule: LEAVE_LIST_VIEW,
    viewRule: LEAVE_LIST_VIEW,
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    updateRule: LEAVE_LIST_VIEW,
    deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  });
}

console.log("\n--- Payroll ---");
const PAYROLL_ITEM_RULES = {
  listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
  viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER})`,
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

const payrollSettingsId = await ensureCollection(
  token,
  "payroll_settings",
  [
    textField("name"),
    boolField("is_active"),
    selectField("payroll_cycle", ["monthly", "biweekly", "weekly"]),
    numberField("cutoff_start_day"),
    numberField("cutoff_end_day"),
    numberField("payday_day"),
    selectField("prorate_method", ["calendar_days", "working_days"]),
    boolField("attendance_bonus_enabled"),
    numberField("attendance_bonus_amount"),
    boolField("approved_leave_counts_as_presence"),
    boolField("approved_field_activity_counts_as_presence"),
    numberField("max_unexcused_absence"),
    boolField("late_policy_enabled"),
    numberField("max_late_days"),
    numberField("max_late_minutes_total"),
    boolField("leave_encashment_enabled"),
    numberField("leave_encashment_rate"),
    selectField("leave_encashment_cycle", ["monthly", "yearly"]),
    numberField("max_encashable_days_per_cycle"),
    numberField("min_tenure_months_for_encashment"),
  ],
  HR_OWNER_DELETE,
);
await seedIfEmpty(token, "payroll_settings", "is_active=true", {
  name: "Default",
  is_active: true,
  payroll_cycle: "monthly",
  attendance_bonus_enabled: true,
  attendance_bonus_amount: 200000,
  approved_leave_counts_as_presence: true,
  approved_field_activity_counts_as_presence: true,
  max_unexcused_absence: 0,
  late_policy_enabled: false,
  leave_encashment_enabled: false,
  leave_encashment_rate: 0,
  max_encashable_days_per_cycle: 0,
});

const payrollPeriodsId = await ensureCollection(
  token,
  "payroll_periods",
  [
    textField("name"),
    textField("period_key"),
    dateField("start_date"),
    dateField("end_date"),
    dateField("pay_date"),
    selectField("status", ["draft", "reviewed", "approved", "paid", "closed"]),
    relationField("settings", payrollSettingsId, false),
    textField("notes"),
    relationField("created_by", usersId, false),
    relationField("approved_by", usersId, false),
    dateField("approved_at"),
    dateField("locked_at"),
  ],
  HR_OWNER_DELETE,
);

const profilesRes = await pbJson("GET", "/api/collections/profiles", null, token);
const profilesId = profilesRes.ok ? profilesRes.data.id : null;

const payrollItemsSchema = [
  relationField("period", payrollPeriodsId, false),
  relationField("user", usersId, false),
  textField("employee_name"),
  textField("division"),
  textField("position"),
  numberField("base_salary"),
  numberField("fixed_allowance"),
  numberField("overtime_amount"),
  numberField("bonus_amount"),
  boolField("attendance_bonus_eligible"),
  numberField("attendance_bonus_amount"),
  textField("attendance_bonus_reason"),
  numberField("leave_encashment_days"),
  numberField("leave_encashment_rate"),
  numberField("leave_encashment_amount"),
  textField("leave_encashment_reason"),
  numberField("leave_quota_credit_days"),
  numberField("leave_quota_credit_amount"),
  textField("leave_quota_credit_reason"),
  numberField("extra_bonus_amount"),
  boolField("extra_bonus_eligible"),
  textField("extra_bonus_reason"),
  numberField("late_deduction"),
  numberField("absence_deduction"),
  numberField("loan_deduction"),
  numberField("other_deduction"),
  numberField("gross_amount"),
  numberField("total_deduction"),
  numberField("net_amount"),
  selectField("status", ["calculated", "reviewed", "approved", "paid"]),
  boolField("is_overridden"),
  textField("override_note"),
];
if (profilesId) payrollItemsSchema.splice(2, 0, relationField("profile", profilesId, false));

const payrollItemsId = await ensureCollection(token, "payroll_items", payrollItemsSchema, PAYROLL_ITEM_RULES);

await ensureCollection(
  token,
  "payroll_adjustments",
  [
    relationField("payroll_item", payrollItemsId, false),
    selectField("adjustment_type", ["addition", "deduction"]),
    textField("component"),
    numberField("amount"),
    textField("reason"),
    relationField("created_by", usersId, false),
    dateField("created_at"),
  ],
  HR_OWNER_DELETE,
);

await ensureCollection(
  token,
  "leave_balances",
  [
    relationField("user", usersId, false),
    numberField("year"),
    numberField("entitled_days"),
    numberField("used_days"),
    numberField("remaining_days"),
    numberField("encashed_days"),
  ],
  PAYROLL_ITEM_RULES,
);

console.log("\n--- HR Rating (seed) ---");
const aspectDefaults = [
  { code: "discipline", name: "Discipline", sort_order: 1 },
  { code: "responsibility", name: "Responsibility", sort_order: 2 },
  { code: "teamwork", name: "Teamwork", sort_order: 3 },
  { code: "communication", name: "Communication", sort_order: 4 },
  { code: "work_quality", name: "Work Quality", sort_order: 5 },
];
for (const d of aspectDefaults) {
  const f = `code = "${d.code}"`;
  await seedIfEmpty(token, "hr_rating_aspects", f, {
    ...d,
    is_active: true,
    min_score: 1,
    max_score: 5,
  });
}
await seedIfEmpty(token, "hr_rating_periods", 'name = "Penilaian Semester 1 2026"', {
  name: "Penilaian Semester 1 2026",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  status: "open",
  description: "Periode penilaian default (lokal)",
});

console.log("\n--- Offices (GPS) ---");
await ensureCollection(
  token,
  "offices",
  [
    textField("name", true),
    textField("code"),
    boolField("is_active"),
    numberField("lat"),
    numberField("lng"),
    numberField("radius"),
    textField("address"),
    numberField("max_checkin_distance"),
    textField("timezone"),
  ],
  {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER})`,
    deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
  },
);

console.log("\n--- Verify collections ---");
const check = [
  "work_calendar_settings",
  "office_holidays",
  "division_quotas",
  "hr_compensation_settings",
  "overtime_requests",
  "field_activity_requests",
  "attendance_settings",
  "attendance_logs",
  "leave_requests",
  "offices",
  "payroll_settings",
  "payroll_periods",
  "payroll_items",
  "payroll_adjustments",
  "leave_balances",
];
let allOk = true;
for (const name of check) {
  const res = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (res.ok) console.log(`  OK  ${name}`);
  else {
    console.log(`  FAIL ${name} (${res.status})`);
    allOk = false;
  }
}

console.log(allOk ? "\nDone. Refresh /hr/payroll dan modul HR lainnya." : "\nSome collections still missing — cek log di atas.");
