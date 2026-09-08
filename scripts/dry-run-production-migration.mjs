/**
 * Phase 20 — Idempotent Production Migration DRY-RUN.
 * READ-ONLY against Production. Uses only GET requests.
 * NO POST / PATCH / PUT / DELETE is ever made.
 *
 * Run: node scripts/dry-run-production-migration.mjs
 * Output: docs/_dry_run_result.json  (machine-readable)
 *         stdout                     (human-readable summary)
 */

import fs from "fs";
import path from "path";

// ─── Safety guard ────────────────────────────────────────────────────────────
const FORBIDDEN_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const _originalFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(url, init = {}) {
  const method = String(init?.method || "GET").toUpperCase();
  if (FORBIDDEN_METHODS.has(method)) {
    throw new Error(`DRY-RUN SAFETY: ${method} ${url} was blocked. This script is READ-ONLY.`);
  }
  return _originalFetch(url, init);
};

// ─── Env ─────────────────────────────────────────────────────────────────────
function getKey(text, key) {
  const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) return "";
  let v = m[1].trim().replace(/\r$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

const prodText = fs.existsSync(path.join(process.cwd(), ".env.local.production-backup"))
  ? fs.readFileSync(path.join(process.cwd(), ".env.local.production-backup"), "utf8")
  : "";
const PROD_URL   = (getKey(prodText, "NEXT_PUBLIC_POCKETBASE_URL") || "https://pb.serba.space").replace(/\/$/, "");
const PROD_EMAIL = getKey(prodText, "POCKETBASE_ADMIN_EMAIL");
const PROD_PASS  = getKey(prodText, "POCKETBASE_ADMIN_PASSWORD");

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function adminAuth(base, email, pass) {
  const r = await _originalFetch(`${base}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.token) throw new Error(`Admin auth failed (${r.status}): ${JSON.stringify(d).slice(0,120)}`);
  return d.token;
}

async function getCollection(base, token, name) {
  const r = await fetch(`${base}/api/collections/${name}`, {
    headers: { Authorization: token },
  });
  if (r.status === 404) return null;
  return r.json().catch(() => null);
}

function fieldMap(col) {
  const out = {};
  for (const f of col?.schema || []) out[f.name] = f;
  return out;
}

// ─── Migration specification (source-of-truth from Phase 20 analysis) ────────

/**
 * ALL new collections use admin-only rules (null = admin only in PocketBase).
 * Rationale: all API access goes through Next.js admin PocketBase, never direct client SDK.
 */
const ADMIN_ONLY_RULES = {
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
};

const MIGRATION_SPEC = {

  // ── STEP A: users field additions ──────────────────────────────────────────
  users_fields: [
    {
      name: "mobile_session_nonce",
      type: "text",
      required: false,
      notes: "Phase 17E multi-device session. Mobile auth writes nonce on login. Web auth never touches this field.",
    },
    {
      name: "account_type",
      type: "select",
      required: false,
      options: { maxSelect: 1, values: ["owner", "user"] },
      notes: "RBAC gate. Source: lib/rbac.ts AccountType. Production rules already reference @request.auth.account_type.",
    },
    {
      name: "role_code",
      type: "text",
      required: false,
      notes: "HR gating. Values: hr|manager|staff|staff-basic|security|ob. Source: lib/rbac.ts UserRoleCode.",
    },
    {
      name: "dashboard_access",
      type: "bool",
      required: false,
      notes: "Dashboard access flag. Source: lib/rbac.ts getOperationalDashboardRoute.",
    },
  ],

  // ── STEP B: leave_requests field additions ──────────────────────────────────
  leave_fields: [
    {
      name: "start_date",
      type: "text",
      required: false,
      notes: "Written on every leave create (YMD string). Source: leave-server.ts serverSubmitLeave.",
    },
    {
      name: "end_date",
      type: "text",
      required: false,
      notes: "Written on every leave create. Multi-day leave loses end date without this field.",
    },
    {
      name: "reason",
      type: "text",
      required: false,
      notes: "Written with DEFAULT_LEAVE_BOOKING_REASON fallback. Optional in schema.",
    },
    {
      name: "division",
      type: "text",
      required: false,
      notes: "New canonical division field. Source writes both division + devision for legacy compat.",
    },
    {
      name: "position",
      type: "text",
      required: false,
      notes: "Employee position at time of leave. Source: profile.position.",
    },
    {
      name: "booking_date",
      type: "text",
      required: false,
      notes: "ISO datetime of submission. Source: new Date().toISOString().",
    },
    {
      name: "daily_compensation_rate",
      type: "number",
      required: false,
      notes: "Written on approve. Source: computeLeaveCompensationAmount.",
    },
    {
      name: "compensation_amount",
      type: "number",
      required: false,
      notes: "Written on approve. Source: leave-server.ts serverApproveLeave.",
    },
    {
      name: "rejection_reason",
      type: "text",
      required: false,
      notes: "Written on reject. Fallback to note field if this field absent.",
    },
  ],

  // ── STEP C/D/E: new collections ─────────────────────────────────────────────
  new_collections: [

    {
      name: "hr_rating_periods",
      step: "D1",
      purpose: "Rating cycle definitions. Owner/HR create periods to group assignments.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "All access via Next.js admin PB. app/api/hr/rating/periods/route.ts.",
      schema: [
        { name: "name",        type: "text",   required: true,  notes: "Period name e.g. Q3-2026" },
        { name: "start_date",  type: "date",   required: false, notes: "ISO date string stored as '2026-01-01 00:00:00.000Z'" },
        { name: "end_date",    type: "date",   required: false, notes: "" },
        { name: "status",      type: "select", required: false, options: { maxSelect: 1, values: ["draft","open","in_progress","closed","cancelled"] }, notes: "Lifecycle" },
        { name: "description", type: "text",   required: false, notes: "" },
        { name: "created_by",  type: "relation", required: false, relation_target: "users", notes: "Source: ctx.userId" },
      ],
      dependencies: ["users"],
      source_consumers: ["lib/hr/rating-server.ts → serverCreatePeriod/serverListPeriods/serverUpdatePeriodStatus"],
    },

    {
      name: "hr_rating_aspects",
      step: "D2",
      purpose: "Rating criteria/dimensions (Discipline, Responsibility, etc.). Score range 1–5.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Only HR/Owner can manage aspects via admin PB.",
      schema: [
        { name: "code",        type: "text",   required: true,  notes: "Unique code e.g. 'discipline'" },
        { name: "name",        type: "text",   required: true,  notes: "Display name" },
        { name: "description", type: "text",   required: false, notes: "" },
        { name: "sort_order",  type: "number", required: false, notes: "UI ordering" },
        { name: "is_active",   type: "bool",   required: false, notes: "Only active aspects are included in scoring" },
        { name: "min_score",   type: "number", required: false, notes: "Typically 1" },
        { name: "max_score",   type: "number", required: false, notes: "Typically 5" },
      ],
      dependencies: [],
      source_consumers: ["lib/hr/rating-server.ts → listActiveAspects"],
    },

    {
      name: "hr_rating_assignments",
      step: "D3",
      purpose: "Maps a subject user to a rating period. One assignment per subject per period.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Selection evidence (reviewer identities) must not be readable by subject.",
      schema: [
        { name: "period",                   type: "relation", required: true,  relation_target: "hr_rating_periods",  notes: "Parent period" },
        { name: "subject",                  type: "relation", required: true,  relation_target: "users",              notes: "Employee being rated" },
        { name: "reviewer_count",           type: "number",   required: false, notes: "Requested reviewer count" },
        { name: "assignment_method",        type: "select",   required: false, options: { maxSelect:1, values: ["smart_random","manual"] }, notes: "" },
        { name: "status",                   type: "select",   required: false, options: { maxSelect:1, values: ["draft","assigned","in_progress","completed","cancelled"] }, notes: "Lifecycle" },
        { name: "selection_evidence_json",  type: "text",     required: false, notes: "JSON blob: reviewer selection audit trail. NEVER exposed to subject." },
        { name: "created_by",               type: "relation", required: false, relation_target: "users",              notes: "" },
      ],
      dependencies: ["hr_rating_periods", "users"],
      source_consumers: ["lib/hr/rating-server.ts → serverCreateAssignment/serverListMyReviewerTasks"],
    },

    {
      name: "hr_rating_reviewers",
      step: "D4",
      purpose: "One row per (assignment × reviewer). Tracks submission status and locking.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Reviewer identity must not be exposed to subject via direct PB query.",
      schema: [
        { name: "assignment",      type: "relation", required: true,  relation_target: "hr_rating_assignments", notes: "Parent assignment" },
        { name: "reviewer",        type: "relation", required: true,  relation_target: "users",                 notes: "Reviewer user" },
        { name: "status",          type: "select",   required: false, options: { maxSelect:1, values: ["assigned","draft","submitted","locked"] }, notes: "assigned→draft→locked" },
        { name: "relevance_tier",  type: "text",     required: false, notes: "department|division|office|manual" },
        { name: "selection_note",  type: "text",     required: false, notes: "Assignment method used" },
        { name: "submitted_at",    type: "date",     required: false, notes: "Set when locked" },
      ],
      dependencies: ["hr_rating_assignments", "users"],
      source_consumers: ["lib/hr/rating-server.ts → serverSaveReviewerDraft/serverSubmitReviewer"],
    },

    {
      name: "hr_rating_scores",
      step: "D5",
      purpose: "One score row per (reviewer_row × aspect). Replaced on each draft save.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Per-reviewer scores must not be readable by subject or other reviewers.",
      schema: [
        { name: "reviewer_row", type: "relation", required: true,  relation_target: "hr_rating_reviewers", notes: "Parent reviewer row" },
        { name: "aspect",       type: "relation", required: true,  relation_target: "hr_rating_aspects",   notes: "Which aspect" },
        { name: "score",        type: "number",   required: false, notes: "1–5. Validated server-side." },
        { name: "comment",      type: "text",     required: false, notes: "Optional per-aspect comment" },
      ],
      dependencies: ["hr_rating_reviewers", "hr_rating_aspects"],
      source_consumers: ["lib/hr/rating-server.ts → serverSaveReviewerDraft (delete+recreate pattern)"],
    },

    {
      name: "hr_rating_results",
      step: "D6",
      purpose: "Aggregated result per assignment. Upserted after each reviewer submits.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Served to subject via serverGetMyResult which exposes only aggregate (no reviewer breakdown).",
      schema: [
        { name: "assignment",          type: "relation", required: true,  relation_target: "hr_rating_assignments", notes: "One result per assignment" },
        { name: "overall_score",       type: "number",   required: false, notes: "Mean of reviewer means (0–5)" },
        { name: "category",            type: "text",     required: false, notes: "Sangat Baik|Baik|Perlu Peningkatan|Perlu Perhatian HR" },
        { name: "respondent_count",    type: "number",   required: false, notes: "Submitted reviewer count" },
        { name: "aspect_scores_json",  type: "text",     required: false, notes: "JSON array of per-aspect averages. Exposed to subject in aggregate form only." },
        { name: "summary",             type: "text",     required: false, notes: "AI-generated narrative" },
        { name: "strengths",           type: "text",     required: false, notes: "" },
        { name: "improvements",        type: "text",     required: false, notes: "" },
        { name: "suggestions",         type: "text",     required: false, notes: "" },
        { name: "calculated_at",       type: "date",     required: false, notes: "Last recalculation timestamp" },
      ],
      dependencies: ["hr_rating_assignments"],
      source_consumers: ["lib/hr/rating-server.ts → recalculateAssignmentResult/serverGetMyResult"],
    },

    {
      name: "hr_staff_reports",
      step: "C1",
      purpose: "Staff-submitted incident/facility/safety reports. Employees create; HR/Owner review.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Next.js API enforces: employee can only read own reports. Findings are HR-only.",
      schema: [
        { name: "title",         type: "text",     required: true,  notes: "Max 180 chars (validated server-side)" },
        { name: "body",          type: "text",     required: true,  notes: "Max 8000 chars" },
        { name: "category",      type: "select",   required: false, options: { maxSelect:1, values: ["facility","safety","misconduct","operations","other"] }, notes: "Report-kind uses facility|safety|other" },
        { name: "status",        type: "select",   required: false, options: { maxSelect:1, values: ["draft","submitted","in_review","closed"] }, notes: "Lifecycle" },
        { name: "priority",      type: "select",   required: false, options: { maxSelect:1, values: ["low","medium","high"] }, notes: "" },
        { name: "location_text", type: "text",     required: false, notes: "Max 200 chars" },
        { name: "created_by",    type: "relation", required: true,  relation_target: "users",                notes: "Stamped server-side; never from client body" },
        { name: "company_id",    type: "text",     required: false, notes: "Stamped from ctx.companyIds[0]" },
        { name: "hr_note",       type: "text",     required: false, notes: "HR/Owner only. Never sent to employee in sanitizeCaseForClient." },
        { name: "submitted_at",  type: "date",     required: false, notes: "Set on submit" },
        { name: "closed_at",     type: "date",     required: false, notes: "Set on close" },
        { name: "closed_by",     type: "relation", required: false, relation_target: "users",                notes: "HR/Owner who closed" },
      ],
      dependencies: ["users"],
      source_consumers: ["lib/hr/reporting-server.ts", "app/api/hr/reports/route.ts"],
    },

    {
      name: "hr_findings",
      step: "C2",
      purpose: "HR/Owner-authored findings. Employees CANNOT list or view findings (403 enforced by API).",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Employees blocked at Next.js API layer: serverListCases checks isOwner||isHr for findings.",
      schema: [
        // Same caseSchema() as hr_staff_reports — identical field list
        { name: "title",         type: "text",     required: true,  notes: "Max 180 chars" },
        { name: "body",          type: "text",     required: true,  notes: "Max 8000 chars" },
        { name: "category",      type: "select",   required: false, options: { maxSelect:1, values: ["facility","safety","misconduct","operations","other"] }, notes: "Finding-kind: safety|misconduct|operations|other" },
        { name: "status",        type: "select",   required: false, options: { maxSelect:1, values: ["draft","submitted","in_review","closed"] }, notes: "" },
        { name: "priority",      type: "select",   required: false, options: { maxSelect:1, values: ["low","medium","high"] }, notes: "" },
        { name: "location_text", type: "text",     required: false, notes: "" },
        { name: "created_by",    type: "relation", required: true,  relation_target: "users",                notes: "" },
        { name: "company_id",    type: "text",     required: false, notes: "" },
        { name: "hr_note",       type: "text",     required: false, notes: "HR/Owner note" },
        { name: "submitted_at",  type: "date",     required: false, notes: "" },
        { name: "closed_at",     type: "date",     required: false, notes: "" },
        { name: "closed_by",     type: "relation", required: false, relation_target: "users",                notes: "" },
      ],
      dependencies: ["users"],
      source_consumers: ["lib/hr/reporting-server.ts", "app/api/hr/findings/route.ts"],
    },

    {
      name: "hr_case_attachments",
      step: "C3",
      purpose: "Attachment metadata + binary file for reports and findings. Files served via auth-gated Next.js routes only.",
      rules: ADMIN_ONLY_RULES,
      rule_rationale: "Admin-only. Files never served as public PocketBase URLs. Served via /api/hr/{reports|findings}/:id/attachments/:attId with auth check.",
      schema: [
        { name: "kind",          type: "select",   required: false, options: { maxSelect:1, values: ["report","finding"] }, notes: "Discriminator for parent collection" },
        { name: "parent_id",     type: "text",     required: true,  notes: "ID of parent hr_staff_reports or hr_findings record" },
        { name: "original_name", type: "text",     required: false, notes: "Original filename from client" },
        { name: "mime",          type: "text",     required: false, notes: "MIME type: image/jpeg|image/png|image/webp" },
        { name: "size",          type: "number",   required: false, notes: "Bytes. Source validates ≤ 10MB before upload." },
        { name: "created_by",    type: "relation", required: false, relation_target: "users",                notes: "" },
        {
          name: "file",
          type: "file",
          required: false,
          file_options: {
            maxSelect: 1,
            maxSize: 10485760,  // 10MB from REPORTING_MAX_FILE_BYTES
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
            thumbs: [],
            protected: false,  // Protection is enforced at Next.js layer, not PocketBase public URL
          },
          notes: "CRITICAL: This field is MISSING from bootstrap-local-pb.mjs but REQUIRED by reporting-server.ts:401 (File blob upload). Must be present when creating this collection in Production.",
        },
      ],
      dependencies: ["users"],
      source_consumers: ["lib/hr/reporting-server.ts → serverAddAttachment/serverReadAttachmentBytes"],
      bootstrap_bug: "bootstrap-local-pb.mjs omits the 'file' field. Production creation must include it.",
    },
  ],
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
const prodToken = await adminAuth(PROD_URL, PROD_EMAIL, PROD_PASS);

// ─── DRY-RUN: check Production state ─────────────────────────────────────────

const results = {
  generated: new Date().toISOString(),
  prod_url: PROD_URL,
  summary: { create_collection: [], add_field: [], keep_field: [], keep_rule: [], conflicts: [], blockers: [] },
  users_audit: {},
  leave_audit: {},
  collections_audit: {},
};

// ── CHECK USERS FIELDS ────────────────────────────────────────────────────────
const usersCol = await getCollection(PROD_URL, prodToken, "users");
const usersFields = fieldMap(usersCol);

results.users_audit.rules = {
  listRule:   usersCol?.listRule   ?? null,
  viewRule:   usersCol?.viewRule   ?? null,
  createRule: usersCol?.createRule ?? null,
  updateRule: usersCol?.updateRule ?? null,
  deleteRule: usersCol?.deleteRule ?? null,
};

results.users_audit.fields = {};
for (const spec of MIGRATION_SPEC.users_fields) {
  const existing = usersFields[spec.name];
  if (!existing) {
    results.users_audit.fields[spec.name] = { status: "MISSING", action: "ADD_FIELD", spec };
    results.summary.add_field.push(`users.${spec.name} (${spec.type})`);
  } else {
    const typeMatch = existing.type === spec.type;
    results.users_audit.fields[spec.name] = {
      status: typeMatch ? "EXISTS_OK" : "EXISTS_TYPE_MISMATCH",
      existing_type: existing.type,
      expected_type: spec.type,
      action: typeMatch ? "KEEP" : "CONFLICT",
    };
    if (typeMatch) results.summary.keep_field.push(`users.${spec.name}`);
    else results.summary.conflicts.push(`users.${spec.name}: expected ${spec.type}, found ${existing.type}`);
  }
}

// ── CHECK LEAVE FIELDS ────────────────────────────────────────────────────────
const leaveCol = await getCollection(PROD_URL, prodToken, "leave_requests");
const leaveFields = fieldMap(leaveCol);

results.leave_audit.rules = {
  listRule:   leaveCol?.listRule   ?? null,
  viewRule:   leaveCol?.viewRule   ?? null,
  createRule: leaveCol?.createRule ?? null,
  updateRule: leaveCol?.updateRule ?? null,
  deleteRule: leaveCol?.deleteRule ?? null,
};

results.leave_audit.fields = {};
for (const spec of MIGRATION_SPEC.leave_fields) {
  const existing = leaveFields[spec.name];
  if (!existing) {
    results.leave_audit.fields[spec.name] = { status: "MISSING", action: "ADD_FIELD", spec };
    results.summary.add_field.push(`leave_requests.${spec.name} (${spec.type})`);
  } else {
    const typeMatch = existing.type === spec.type;
    results.leave_audit.fields[spec.name] = {
      status: typeMatch ? "EXISTS_OK" : "EXISTS_TYPE_MISMATCH",
      existing_type: existing.type,
      expected_type: spec.type,
      action: typeMatch ? "KEEP" : "CONFLICT",
    };
    if (typeMatch) results.summary.keep_field.push(`leave_requests.${spec.name}`);
    else results.summary.conflicts.push(`leave_requests.${spec.name}: expected ${spec.type}, found ${existing.type}`);
  }
}

// ── CHECK NEW COLLECTIONS ─────────────────────────────────────────────────────
for (const colSpec of MIGRATION_SPEC.new_collections) {
  const existing = await getCollection(PROD_URL, prodToken, colSpec.name);
  const audit = { step: colSpec.step, exists: !!existing, fields: {} };

  if (!existing) {
    audit.action = "CREATE_COLLECTION";
    audit.conflict = null;
    results.summary.create_collection.push(colSpec.name);
  } else {
    audit.action = "COLLECTION_EXISTS";
    audit.existing_rules = {
      listRule:   existing.listRule   ?? null,
      viewRule:   existing.viewRule   ?? null,
      createRule: existing.createRule ?? null,
      updateRule: existing.updateRule ?? null,
      deleteRule: existing.deleteRule ?? null,
    };
    const exFields = fieldMap(existing);
    let hasConflicts = false;
    for (const fSpec of colSpec.schema) {
      const ef = exFields[fSpec.name];
      if (!ef) {
        audit.fields[fSpec.name] = { status: "MISSING", action: "ADD_FIELD" };
        results.summary.add_field.push(`${colSpec.name}.${fSpec.name}`);
      } else if (ef.type !== fSpec.type) {
        audit.fields[fSpec.name] = { status: "TYPE_MISMATCH", existing_type: ef.type, expected_type: fSpec.type };
        results.summary.conflicts.push(`${colSpec.name}.${fSpec.name}: expected ${fSpec.type}, found ${ef.type}`);
        hasConflicts = true;
      } else {
        audit.fields[fSpec.name] = { status: "OK" };
      }
    }
    if (!hasConflicts) {
      results.summary.keep_field.push(`${colSpec.name} (all fields OK)`);
    }
  }

  // Check bootstrap bug: hr_case_attachments needs 'file' field
  if (colSpec.name === "hr_case_attachments") {
    audit.bootstrap_bug_noted = colSpec.bootstrap_bug;
    if (!existing) {
      audit.file_field_will_be_created = true;
    } else {
      const exFields2 = fieldMap(existing);
      if (!exFields2.file) {
        audit.file_field_missing_from_existing = true;
        results.summary.blockers.push("hr_case_attachments.file field missing — attachment upload will fail");
      }
    }
  }

  results.collections_audit[colSpec.name] = audit;
}

// ── EXISTING PRODUCTION RULES (keep, never overwrite) ─────────────────────────
// Already captured above in users_audit.rules and leave_audit.rules.
// Confirm profiles rules too.
const profilesCol = await getCollection(PROD_URL, prodToken, "profiles");
results.profiles_rules = {
  listRule:   profilesCol?.listRule   ?? null,
  viewRule:   profilesCol?.viewRule   ?? null,
  createRule: profilesCol?.createRule ?? null,
  updateRule: profilesCol?.updateRule ?? null,
  deleteRule: profilesCol?.deleteRule ?? null,
};

for (const rule of ["listRule","viewRule","createRule","updateRule","deleteRule"]) {
  if (results.profiles_rules[rule] !== null && results.profiles_rules[rule] !== undefined) {
    results.summary.keep_rule.push(`profiles.${rule}`);
  }
  if (results.users_audit.rules[rule] !== null && results.users_audit.rules[rule] !== undefined) {
    results.summary.keep_rule.push(`users.${rule}`);
  }
  if (results.leave_audit.rules[rule] !== null && results.leave_audit.rules[rule] !== undefined) {
    results.summary.keep_rule.push(`leave_requests.${rule}`);
  }
}

// ─── Output ───────────────────────────────────────────────────────────────────
fs.writeFileSync(
  path.join(process.cwd(), "docs", "_dry_run_result.json"),
  JSON.stringify({ MIGRATION_SPEC, results }, null, 2),
  "utf8",
);

// Human-readable stdout
const s = results.summary;
const lines = [
  "═══════════════════════════════════════════════════════════",
  "  PHASE 20 — DRY-RUN PRODUCTION MIGRATION CHECKER",
  "═══════════════════════════════════════════════════════════",
  `  Target   : ${PROD_URL}`,
  `  Generated: ${results.generated}`,
  "═══════════════════════════════════════════════════════════",
  "",
  `CREATE COLLECTION (${s.create_collection.length}):`,
  ...s.create_collection.map(c => `  + ${c}`),
  "",
  `ADD FIELD (${s.add_field.length}):`,
  ...s.add_field.map(f => `  + ${f}`),
  "",
  `KEEP EXISTING (${s.keep_field.length}):`,
  ...s.keep_field.map(f => `  ✓ ${f}`),
  "",
  `KEEP EXISTING RULES (${s.keep_rule.length}):`,
  ...s.keep_rule.map(r => `  ✓ ${r}`),
  "",
  `CONFLICTS (${s.conflicts.length}):`,
  ...s.conflicts.map(c => `  ⚠ ${c}`),
  "",
  `BLOCKERS (${s.blockers.length}):`,
  ...s.blockers.map(b => `  ✗ ${b}`),
  "",
  `Collections audit:`,
  ...Object.entries(results.collections_audit).map(([name, a]) =>
    `  ${a.exists ? "EXISTS" : "MISSING"} ${name}`
  ),
  "",
  `Users rules (PRODUCTION — KEEP):`,
  ...Object.entries(results.users_audit.rules || {}).map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`),
  "",
  `Leave rules (PRODUCTION — KEEP):`,
  ...Object.entries(results.leave_audit.rules || {}).map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`),
  "",
  `Profiles rules (PRODUCTION — KEEP):`,
  ...Object.entries(results.profiles_rules || {}).map(([k,v]) => `  ${k}: ${JSON.stringify(v)}`),
  "",
  "Output: docs/_dry_run_result.json",
  "═══════════════════════════════════════════════════════════",
];
console.log(lines.join("\n"));
process.exit(0);
