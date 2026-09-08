/**
 * Bootstrap PocketBase LOCAL at 127.0.0.1:8090.
 * Refuses production (pb.serba.space / :8091) and staging (:8092 / pb-staging).
 * Does not write to those hosts. Data dir: ./pb_data (gitignored).
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { buildUsersUpdateRulePbExpression } from "./pb-user-privilege-rule.mjs";

const ROOT = process.cwd();
const BIND = "127.0.0.1:8090";
const BASE = `http://${BIND}`;
const DATA_DIR = path.join(ROOT, "pb_data");
const BIN_DIR = path.join(ROOT, "tools", "local-pb");
const EXE = path.join(BIN_DIR, "pocketbase.exe");
const ZIP = path.join(BIN_DIR, "pocketbase.zip");
const PB_VERSION = "0.22.27";
const PB_ZIP_URL = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_windows_amd64.zip`;

function refuseIfBlocked(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return;
  if (u.includes("pb.serba.space") || u.includes("serba.space")) {
    console.error("BLOCKED — this script never targets production hosts.");
    process.exit(2);
  }
  if (u.includes("8091") || u.includes("8092") || u.includes("pb-staging")) {
    console.error("BLOCKED — this script is LOCAL :8090 only.");
    process.exit(2);
  }
}

refuseIfBlocked(process.env.NEXT_PUBLIC_POCKETBASE_URL);
refuseIfBlocked(process.env.POCKETBASE_URL);

function loadEnvLocal() {
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

async function downloadBinary() {
  if (fs.existsSync(EXE)) {
    console.log("PocketBase binary exists.");
    return;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  console.log("Downloading PocketBase", PB_VERSION, "...");
  const res = await fetch(PB_ZIP_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ZIP));
  const { execFileSync } = await import("child_process");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Expand-Archive -Force -Path '${ZIP}' -DestinationPath '${BIN_DIR}'`],
    { stdio: "inherit" },
  );
  if (!fs.existsSync(EXE)) throw new Error("pocketbase.exe missing after unzip");
  console.log("Binary ready:", EXE);
}

async function waitHealth(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("PocketBase local did not become healthy on 127.0.0.1:8090");
}

function startServe() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(EXE, ["serve", `--http=${BIND}`, `--dir=${DATA_DIR}`], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  console.log("Started PocketBase LOCAL pid", child.pid);
}

async function json(method, url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
}
function selectField(name, values) {
  return {
    name,
    type: "select",
    required: false,
    system: false,
    options: { maxSelect: 1, values },
  };
}
function relationField(name, collectionId, required = true) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: {
      collectionId,
      cascadeDelete: required,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  };
}
function numberField(name) {
  return { name, type: "number", required: false, system: false, options: { min: null, max: null, noDecimal: false } };
}
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
}

const AUTHED_READ = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: null,
  updateRule: null,
  deleteRule: null,
};
/** Owner dapat CRUD modul entitas dari UI Profil Perusahaan. */
const OWNER_ENTITY_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
  updateRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
  deleteRule:
    '@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")',
};
/** Superuser/admin only — Next.js API uses admin PB (same as staging Rating/Reporting). */
const LOCKED_RULES = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};
const HR_OR_OWNER_EXPR =
  '@request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.account_type = "owner"';

/** Jabatan / departemen / divisi — dibaca & dikelola HR/Owner dari formulir karyawan. */
const HR_EMPLOYEE_OPTIONS_RULES = {
  listRule: '@request.auth.id != ""',
  viewRule: '@request.auth.id != ""',
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

const PROFILES_HR_RULES = {
  listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
  viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
  createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  /** Phase 32: self-update via /api/profile/self only — not direct PB client mutation */
  updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
};

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  for (const f of extras) {
    if (!names.has(f.name)) next.push(f);
  }
  return next;
}

async function ensureCollection(token, name, schema, rules = AUTHED_READ) {
  const existing = await json("GET", `${BASE}/api/collections/${name}`, null, token);
  if (existing.data?.id) {
    const col = existing.data;
    col.schema = ensureFields(col.schema, schema);
    col.listRule = rules.listRule;
    col.viewRule = rules.viewRule;
    col.createRule = rules.createRule;
    col.updateRule = rules.updateRule;
    col.deleteRule = rules.deleteRule;
    const patched = await json("PATCH", `${BASE}/api/collections/${col.id}`, col, token);
    if (!patched.ok) throw new Error(`PATCH ${name} failed: ${JSON.stringify(patched.data)}`);
    return patched.data.id || col.id;
  }
  const created = await json(
    "POST",
    `${BASE}/api/collections`,
    { name, type: "base", schema, ...rules },
    token,
  );
  if (!created.ok) throw new Error(`Create ${name} failed: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

async function ensureRecord(token, collection, filter, body) {
  const q = encodeURIComponent(filter);
  const list = await json(
    "GET",
    `${BASE}/api/collections/${collection}/records?perPage=1&filter=${q}`,
    null,
    token,
  );
  const existing = list.data?.items?.[0];
  if (existing) {
    const res = await json("PATCH", `${BASE}/api/collections/${collection}/records/${existing.id}`, body, token);
    if (!res.ok) throw new Error(`Update ${collection} failed: ${JSON.stringify(res.data)}`);
    return existing.id;
  }
  const res = await json("POST", `${BASE}/api/collections/${collection}/records`, body, token);
  if (!res.ok) throw new Error(`Create ${collection} record failed: ${JSON.stringify(res.data)}`);
  return res.data.id;
}

async function bootstrapSchema(adminEmail, adminPass) {
  let auth = await json("POST", `${BASE}/api/admins/auth-with-password`, {
    identity: adminEmail,
    password: adminPass,
  });

  if (!auth.data?.token) {
    const created = await json("POST", `${BASE}/api/admins`, {
      email: adminEmail,
      password: adminPass,
      passwordConfirm: adminPass,
    });
    if (!created.ok) {
      throw new Error("Create local admin failed: " + JSON.stringify(created.data));
    }
    auth = await json("POST", `${BASE}/api/admins/auth-with-password`, {
      identity: adminEmail,
      password: adminPass,
    });
  }
  if (!auth.data?.token) throw new Error("Local admin auth failed");
  const token = auth.data.token;

  const usersRes = await json("GET", `${BASE}/api/collections/users`, null, token);
  if (!usersRes.ok) throw new Error("GET users collection failed");
  const users = usersRes.data;
  users.schema = ensureFields(users.schema, [
    selectField("account_type", ["owner", "user"]),
    textField("role_code"),
    textField("role"),
    boolField("dashboard_access"),
    selectField("inventory_role", ["none", "staff", "supervisor", "admin"]),
    boolField("web_access"),
    selectField("status", ["active", "inactive"]),
    textField("locale"),
    textField("session_nonce"),
    textField("mobile_session_nonce"),
    boolField("is_checked_in"),
    textField("hr_role_preset"),
  ]);
  users.updateRule = buildUsersUpdateRulePbExpression();
  users.viewRule = "@request.auth.id != \"\"";
  users.listRule = "@request.auth.id != \"\"";
  const patched = await json("PATCH", `${BASE}/api/collections/users`, users, token);
  if (!patched.ok) throw new Error("PATCH users failed: " + JSON.stringify(patched.data));

  const usersId = patched.data.id || users.id;

  await ensureCollection(
    token,
    "profiles",
    [
      relationField("user", usersId, true),
      relationField("manager", usersId, false),
      textField("name"),
      textField("email"),
      textField("position"),
      textField("department"),
      textField("division"),
      textField("phone"),
      textField("address"),
      textField("nik"),
      textField("npwp"),
      textField("employee_code"),
      textField("office_id"),
      numberField("salary"),
      numberField("late_tolerance"),
      textField("shift_start"),
      textField("shift_end"),
      textField("shift_start_saturday"),
      textField("shift_end_saturday"),
      textField("shift_start_sunday"),
      textField("shift_end_sunday"),
      textField("shift_start_weekend"),
      textField("shift_end_weekend"),
      dateField("join_date"),
      boolField("require_checkin_selfie"),
      numberField("leave_bookings_quota"),
      numberField("leave_daily_rate"),
      numberField("extra_bonus_amount"),
      boolField("extra_bonus_enabled"),
      numberField("late_deduction_rupiah_per_minute"),
      numberField("absence_deduction_rupiah_per_day"),
      selectField("profile_status", ["incomplete", "complete", "draft", "active"]),
      textField("bio"),
      dateField("date_of_birth"),
      {
        name: "avatar",
        type: "file",
        required: false,
        system: false,
        options: {
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          thumbs: ["100x100", "200x200"],
        },
      },
    ],
    PROFILES_HR_RULES,
  );

  await ensureDashboardSchema(token, usersId);
  await ensureHrSchema(token, usersId);
  console.log("Local schema bootstrap OK (users, profiles, dashboard, HR collections).");
  return token;
}

/** Minimal collections so Owner dashboard + WorkContext do not 404/500. Dummy data only — not a prod clone. */
async function ensureDashboardSchema(token, usersId) {
  const companyId = await ensureCollection(
    token,
    "biz_company_profile",
    [
      textField("company_name", true),
      textField("legal_name"),
      textField("display_name"),
      textField("code"),
      boolField("is_active"),
      textField("npwp"),
      textField("address"),
      textField("city"),
      textField("phone"),
      textField("email"),
      textField("website"),
    ],
    OWNER_ENTITY_RULES,
  );

  const storesId = await ensureCollection(
    token,
    "biz_stores",
    [
      textField("code", true),
      textField("name", true),
      relationField("company", companyId, false),
      boolField("is_active"),
      boolField("is_primary"),
    ],
    OWNER_ENTITY_RULES,
  );

  const warehousesId = await ensureCollection(
    token,
    "inv_warehouses",
    [
      textField("code", true),
      textField("name", true),
      relationField("company", companyId, false),
      relationField("store", storesId, false),
      selectField("warehouse_role", ["main", "retail", "transit", "damaged"]),
      boolField("is_active"),
      boolField("is_primary"),
    ],
    OWNER_ENTITY_RULES,
  );

  await ensureCollection(token, "biz_stores", [relationField("default_warehouse", warehousesId, false)]);

  await ensureCollection(token, "biz_sales_orders", [
    textField("order_no"),
    dateField("order_date"),
    numberField("total"),
    textField("status"),
    textField("payment_status"),
    dateField("send_to_warehouse_at"),
    textField("warehouse_process_status"),
    relationField("store", storesId, false),
    relationField("company", companyId, false),
  ]);

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
      {
        name: "check_in_selfie",
        type: "file",
        required: false,
        system: false,
        options: {
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          thumbs: [],
        },
      },
    ],
    {
      listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    },
  );

  await ensureCollection(token, "biz_activity_events", [
    textField("event_code", true),
    selectField("severity", ["info", "success", "warning"]),
    selectField("module", ["sales", "warehouse", "hr", "finance", "purchase", "settings"]),
    textField("entity_type"),
    textField("entity_id"),
    textField("entity_label"),
    relationField("actor", usersId, false),
    relationField("company", companyId, false),
    relationField("store", storesId, false),
    relationField("warehouse", warehousesId, false),
    textField("payload_json"),
    textField("occurred_at", true),
    textField("dedupe_key"),
  ]);

  await ensureCollection(token, "sys_audit_log", [
    textField("occurred_at", true),
    relationField("actor", usersId, false),
    textField("actor_device"),
    textField("module", true),
    textField("action", true),
    textField("summary"),
    textField("changes_json"),
    relationField("company", companyId, false),
    relationField("store", storesId, false),
    relationField("warehouse", warehousesId, false),
  ]);

  await ensureCollection(token, "biz_user_companies", [
    relationField("user", usersId, true),
    relationField("company", companyId, true),
    boolField("is_active"),
  ]);

  const usersRes = await json("GET", `${BASE}/api/collections/users`, null, token);
  if (!usersRes.ok) throw new Error("GET users for context fields failed");
  const users = usersRes.data;
  users.schema = ensureFields(users.schema, [
    relationField("active_company", companyId, false),
    relationField("default_company", companyId, false),
    relationField("active_store", storesId, false),
    relationField("default_store", storesId, false),
    relationField("active_warehouse", warehousesId, false),
    relationField("default_warehouse", warehousesId, false),
  ]);
  const patchedUsers = await json("PATCH", `${BASE}/api/collections/users`, users, token);
  if (!patchedUsers.ok) throw new Error("PATCH users context fields failed: " + JSON.stringify(patchedUsers.data));
}

/** HR dashboard + Rating/Reporting APIs. Empty collections, not a prod clone. Does not change HR business logic. */
async function ensureHrSchema(token, usersId) {
  await ensureCollection(token, "leave_requests", [
    relationField("user", usersId, false),
    textField("date"),
    selectField("status", ["pending", "approved", "rejected", "cancelled"]),
    textField("note"),
  ]);

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
      createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
      updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
      deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
    },
  );

  const periodsId = await ensureCollection(
    token,
    "hr_rating_periods",
    [
      textField("name", true),
      dateField("start_date"),
      dateField("end_date"),
      selectField("status", ["draft", "open", "in_progress", "closed", "cancelled"]),
      textField("description"),
      relationField("created_by", usersId, false),
    ],
    LOCKED_RULES,
  );
  const aspectsId = await ensureCollection(
    token,
    "hr_rating_aspects",
    [
      textField("code", true),
      textField("name", true),
      textField("description"),
      numberField("sort_order"),
      boolField("is_active"),
      numberField("min_score"),
      numberField("max_score"),
    ],
    LOCKED_RULES,
  );
  const assignmentsId = await ensureCollection(
    token,
    "hr_rating_assignments",
    [
      relationField("period", periodsId, true),
      relationField("subject", usersId, true),
      numberField("reviewer_count"),
      selectField("assignment_method", ["smart_random", "manual"]),
      selectField("status", ["draft", "assigned", "in_progress", "completed", "cancelled"]),
      textField("selection_evidence_json"),
      relationField("created_by", usersId, false),
    ],
    LOCKED_RULES,
  );
  const reviewersId = await ensureCollection(
    token,
    "hr_rating_reviewers",
    [
      relationField("assignment", assignmentsId, true),
      relationField("reviewer", usersId, true),
      selectField("status", ["assigned", "draft", "submitted", "locked"]),
      textField("relevance_tier"),
      textField("selection_note"),
      dateField("submitted_at"),
    ],
    LOCKED_RULES,
  );
  await ensureCollection(
    token,
    "hr_rating_scores",
    [
      relationField("reviewer_row", reviewersId, true),
      relationField("aspect", aspectsId, true),
      numberField("score"),
      textField("comment"),
    ],
    LOCKED_RULES,
  );
  await ensureCollection(
    token,
    "hr_rating_results",
    [
      relationField("assignment", assignmentsId, true),
      numberField("overall_score"),
      textField("category"),
      numberField("respondent_count"),
      textField("aspect_scores_json"),
      textField("summary"),
      textField("strengths"),
      textField("improvements"),
      textField("suggestions"),
      dateField("calculated_at"),
    ],
    LOCKED_RULES,
  );

  function caseSchema() {
    return [
      textField("title", true),
      textField("body", true),
      selectField("category", ["facility", "safety", "misconduct", "operations", "other"]),
      selectField("status", ["draft", "submitted", "in_review", "closed"]),
      selectField("priority", ["low", "medium", "high"]),
      textField("location_text"),
      relationField("created_by", usersId, true),
      textField("company_id"),
      textField("hr_note"),
      dateField("submitted_at"),
      dateField("closed_at"),
      relationField("closed_by", usersId, false),
    ];
  }
  await ensureCollection(token, "hr_staff_reports", caseSchema(), LOCKED_RULES);
  await ensureCollection(token, "hr_findings", caseSchema(), LOCKED_RULES);
  await ensureCollection(
    token,
    "hr_case_attachments",
    [
      selectField("kind", ["report", "finding"]),
      textField("parent_id", true),
      {
        name: "file",
        type: "file",
        required: true,
        system: false,
        options: {
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          thumbs: ["128x128"],
        },
      },
      textField("original_name"),
      textField("mime"),
      numberField("size"),
      relationField("created_by", usersId, false),
    ],
    LOCKED_RULES,
  );

  await ensureCollection(
    token,
    "hr_employee_options",
    [
      {
        name: "category",
        type: "select",
        required: true,
        system: false,
        options: { maxSelect: 1, values: ["position", "department", "division"] },
      },
      textField("name", true),
      numberField("sort_order"),
      boolField("is_active"),
    ],
    HR_EMPLOYEE_OPTIONS_RULES,
  );

  const HR_CALENDAR_RULES = {
    listRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    viewRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  };
  const OFFICE_HOLIDAYS_RULES = {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
  };

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
    HR_CALENDAR_RULES,
  );
  await ensureCollection(
    token,
    "office_holidays",
    [dateField("date"), textField("name"), boolField("is_active")],
    OFFICE_HOLIDAYS_RULES,
  );
  await ensureCollection(
    token,
    "division_quotas",
    [textField("division", true), numberField("max_people_per_day")],
    HR_CALENDAR_RULES,
  );
  await ensureCollection(
    token,
    "hr_compensation_settings",
    [
      textField("name", true),
      boolField("is_active"),
      numberField("overtime_hourly_rate"),
      numberField("overtime_multiplier"),
      numberField("leave_daily_compensation_rate"),
    ],
    {
      ...HR_CALENDAR_RULES,
      deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
    },
  );
  await ensureCollection(
    token,
    "attendance_settings",
    [numberField("max_late_minutes"), textField("allow_remote"), textField("gps_required")],
    HR_CALENDAR_RULES,
  );
  await ensureCollection(
    token,
    "overtime_requests",
    [
      relationField("user", usersId, true),
      dateField("work_date"),
      textField("start_time"),
      textField("end_time"),
      numberField("hours"),
      selectField("source", ["hr_assignment", "staff_request"]),
      selectField("status", [
        "waiting_staff",
        "waiting_hr",
        "staff_accepted",
        "staff_declined",
        "hr_approved",
        "hr_rejected",
      ]),
      textField("reason"),
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
    {
      listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    },
  );
  await ensureCollection(
    token,
    "field_activity_requests",
    [
      relationField("user", usersId, true),
      dateField("start_date"),
      dateField("end_date"),
      selectField("activity_type", ["meeting", "visit", "out_of_town", "other"]),
      textField("destination"),
      textField("reason"),
      selectField("status", ["pending_hr", "approved", "rejected", "cancelled"]),
      textField("rejection_reason"),
      textField("hr_action_by"),
      textField("hr_action_name"),
      textField("hr_action_at"),
    ],
    {
      listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
      createRule: '@request.auth.id != "" && @request.data.user = @request.auth.id',
      updateRule: `@request.auth.id != "" && ((user = @request.auth.id && status = "pending_hr") || ${HR_OR_OWNER_EXPR})`,
      deleteRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    },
  );

  const profilesCol = await json("GET", `${BASE}/api/collections/profiles`, null, token);
  const profilesId = profilesCol.data?.id;

  const PAYROLL_ITEM_RULES = {
    listRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
    viewRule: `@request.auth.id != "" && (user = @request.auth.id || ${HR_OR_OWNER_EXPR})`,
    createRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
    updateRule: `@request.auth.id != "" && (${HR_OR_OWNER_EXPR})`,
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
    {
      ...HR_CALENDAR_RULES,
      deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
    },
  );

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
    {
      ...HR_CALENDAR_RULES,
      deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
    },
  );

  const payrollItemsFields = [
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
  if (profilesId) payrollItemsFields.splice(2, 0, relationField("profile", profilesId, false));

  const payrollItemsId = await ensureCollection(token, "payroll_items", payrollItemsFields, PAYROLL_ITEM_RULES);

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
    {
      ...HR_CALENDAR_RULES,
      deleteRule: `@request.auth.id != "" && (@request.auth.role = "owner" || @request.auth.account_type = "owner")`,
    },
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
}

async function seedLocalOps(token) {
  const companyId = await ensureRecord(token, "biz_company_profile", 'code = "LOCAL"', {
    company_name: "SERBA Local",
    legal_name: "SERBA Local",
    code: "LOCAL",
    is_active: true,
  });

  const storeId = await ensureRecord(token, "biz_stores", 'code = "ST-LOCAL"', {
    code: "ST-LOCAL",
    name: "Toko Local",
    company: companyId,
    is_active: true,
    is_primary: true,
  });

  const warehouseId = await ensureRecord(token, "inv_warehouses", 'code = "WH-LOCAL"', {
    code: "WH-LOCAL",
    name: "Gudang Local",
    company: companyId,
    store: storeId,
    warehouse_role: "main",
    is_active: true,
    is_primary: true,
  });

  await json("PATCH", `${BASE}/api/collections/biz_stores/records/${storeId}`, {
    default_warehouse: warehouseId,
  }, token);

  const usersList = await json("GET", `${BASE}/api/collections/users/records?perPage=200`, null, token);
  const ctx = {
    active_company: companyId,
    default_company: companyId,
    active_store: storeId,
    default_store: storeId,
    active_warehouse: warehouseId,
    default_warehouse: warehouseId,
  };
  for (const u of usersList.data?.items ?? []) {
    const res = await json("PATCH", `${BASE}/api/collections/users/records/${u.id}`, ctx, token);
    if (!res.ok) throw new Error(`Wire user context failed (${u.email}): ${JSON.stringify(res.data)}`);
    const accessFilter = encodeURIComponent(`user = "${u.id}" && company = "${companyId}"`);
    const access = await json(
      "GET",
      `${BASE}/api/collections/biz_user_companies/records?perPage=1&filter=${accessFilter}`,
      null,
      token,
    );
    if (!access.data?.items?.[0]) {
      const created = await json(
        "POST",
        `${BASE}/api/collections/biz_user_companies/records`,
        { user: u.id, company: companyId, is_active: true },
        token,
      );
      if (!created.ok) throw new Error("Create user company access failed: " + JSON.stringify(created.data));
    }
  }

  console.log("Local ops fixtures OK: company/store/warehouse + user context.");

  await ensureRecord(token, "offices", 'code = "OF-LOCAL"', {
    name: "Kantor Local",
    code: "OF-LOCAL",
    is_active: true,
    lat: -6.2,
    lng: 106.8,
    radius: 150,
  });

  const aspectDefaults = [
    { code: "discipline", name: "Discipline", sort_order: 1 },
    { code: "responsibility", name: "Responsibility", sort_order: 2 },
    { code: "teamwork", name: "Teamwork", sort_order: 3 },
    { code: "communication", name: "Communication", sort_order: 4 },
    { code: "work_quality", name: "Work Quality", sort_order: 5 },
  ];
  for (const d of aspectDefaults) {
    await ensureRecord(token, "hr_rating_aspects", `code = "${d.code}"`, {
      ...d,
      is_active: true,
      min_score: 1,
      max_score: 5,
    });
  }
  await ensureRecord(token, "hr_rating_periods", 'name = "Penilaian Semester 1 2026"', {
    name: "Penilaian Semester 1 2026",
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    status: "open",
    description: "Periode penilaian default (lokal)",
  });
  console.log("Local HR fixtures OK: office + rating aspects + default period.");
}

async function ensureOwner(token, password, domain) {
  const email = `smoke-owner@${domain}`;
  const filter = encodeURIComponent(`email = "${email}"`);
  const list = await json("GET", `${BASE}/api/collections/users/records?perPage=1&filter=${filter}`, null, token);
  const body = {
    email,
    name: "Smoke Owner",
    password,
    passwordConfirm: password,
    account_type: "owner",
    role_code: "",
    role: "owner",
    dashboard_access: true,
    inventory_role: "admin",
    web_access: true,
    status: "active",
    locale: "id",
  };
  const existing = list.data?.items?.[0];
  if (existing) {
    const res = await json("PATCH", `${BASE}/api/collections/users/records/${existing.id}`, body, token);
    if (!res.ok) throw new Error("Update owner failed: " + JSON.stringify(res.data));
    console.log("Owner fixture updated:", email);
    return;
  }
  const res = await json("POST", `${BASE}/api/collections/users/records`, body, token);
  if (!res.ok) throw new Error("Create owner failed: " + JSON.stringify(res.data));
  console.log("Owner fixture created:", email, "(not in npm run smoke:seed; local 14D only)");
}

const env = loadEnvLocal();
const adminEmail = env.POCKETBASE_ADMIN_EMAIL || "local-admin@serba.local";
const adminPass = env.POCKETBASE_ADMIN_PASSWORD;
if (!adminPass || adminEmail.toLowerCase().includes("gmail.com")) {
  console.error("Refusing: set LOCAL POCKETBASE_ADMIN_EMAIL/PASSWORD in .env.local first (not production gmail).");
  process.exit(2);
}
refuseIfBlocked(env.NEXT_PUBLIC_POCKETBASE_URL);

await downloadBinary();

let healthy = false;
try {
  const r = await fetch(`${BASE}/api/health`);
  healthy = r.ok;
} catch {
  healthy = false;
}
if (!healthy) startServe();
await waitHealth();
console.log("HEALTH:", BASE, "OK");

const token = await bootstrapSchema(adminEmail, adminPass);
const smokePass = env.SMOKE_PASSWORD || "SerbaSmoke2026!";
const domain = env.SMOKE_EMAIL_DOMAIN || "serba.test";
await ensureOwner(token, smokePass, domain);
await seedLocalOps(token);
console.log("LOCAL PocketBase ready at", BASE);
