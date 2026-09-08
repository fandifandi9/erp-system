/**
 * scripts/migrate-staging-notifications-schema.mjs
 * Phase 25 — Apply notifications + push_tokens schema to STAGING PocketBase ONLY.
 *
 * Safety:
 *   - Uses POCKETBASE_STAGING_ADMIN_EMAIL / _PASSWORD (NOT production admin).
 *   - Targets pb-staging.serba.space (allowlisted in staging-guard.mjs).
 *   - Refuses production hosts (pb.serba.space, :8091).
 *   - Idempotent: if collections/fields already exist they are not overwritten.
 *   - listRule/viewRule are USER-SCOPED.
 *   - createRule/deleteRule = null (server-only).
 *   - NO deletion of existing collections or fields.
 *
 * Run: node scripts/migrate-staging-notifications-schema.mjs
 */

import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";

// ── Staging target ─────────────────────────────────────────────────────────────
// Use the public HTTPS URL (allowlisted in staging-guard.mjs).
// Avoids requiring an SSH tunnel from the local machine.
const TARGET = "https://pb-staging.serba.space";

const env = loadStagingEnv();
assertStagingOnly(env, TARGET);
const admin = requireStagingAdmin(env);

console.log("=== Phase 25 Notifications Schema — STAGING PocketBase ONLY ===");
console.log("TARGET:", TARGET);
console.log("Admin email:", admin.email.slice(0, 4) + "***");
console.log("");

// ── PB helpers ─────────────────────────────────────────────────────────────────
async function pbJson(method, url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 15);
}

function textField(name, required = false) {
  return {
    system: false, id: fieldId("tf"), name, type: "text", required,
    presentable: false, unique: false,
    options: { min: null, max: null, pattern: "" },
  };
}
function boolField(name) {
  return {
    system: false, id: fieldId("bf"), name, type: "bool", required: false,
    presentable: false, unique: false, options: {},
  };
}
function selectField(name, values) {
  return {
    system: false, id: fieldId("sf"), name, type: "select", required: false,
    presentable: false, unique: false,
    options: { maxSelect: 1, values },
  };
}
function relationField(name, collectionId, required = true) {
  return {
    system: false, id: fieldId("rf"), name, type: "relation", required,
    presentable: false, unique: false,
    options: { collectionId, cascadeDelete: false, minSelect: null, maxSelect: 1, displayFields: null },
  };
}
function dateField(name) {
  return {
    system: false, id: fieldId("df"), name, type: "date", required: false,
    presentable: false, unique: false, options: { min: "", max: "" },
  };
}

function ensureFields(existing, extras) {
  const names = new Set((existing || []).map((f) => f.name));
  const next = [...(existing || [])];
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      console.log(`    + field: ${f.name} (new)`);
    } else {
      console.log(`    ~ field: ${f.name} (exists, skipped)`);
    }
  }
  return next;
}

async function ensureCollection(token, name, schema, rules) {
  const existing = await pbJson("GET", `${TARGET}/api/collections/${name}`, null, token);
  if (existing.data?.id) {
    console.log(`  [EXIST] ${name} — extending fields only, applying rules`);
    const col = existing.data;
    col.schema = ensureFields(col.schema, schema);
    col.listRule = rules.listRule;
    col.viewRule = rules.viewRule;
    col.createRule = rules.createRule;
    col.updateRule = rules.updateRule;
    col.deleteRule = rules.deleteRule;
    const patched = await pbJson("PATCH", `${TARGET}/api/collections/${col.id}`, col, token);
    if (!patched.ok) throw new Error(`PATCH ${name} failed: ${JSON.stringify(patched.data)}`);
    return patched.data.id || col.id;
  }
  console.log(`  [CREATE] ${name}`);
  const created = await pbJson(
    "POST",
    `${TARGET}/api/collections`,
    { name, type: "base", schema, ...rules },
    token,
  );
  if (!created.ok) throw new Error(`Create ${name} failed: ${JSON.stringify(created.data)}`);
  return created.data.id;
}

// ── Main migration ──────────────────────────────────────────────────────────────
async function migrate() {
  // Health check
  const health = await pbJson("GET", `${TARGET}/api/health`, null, null);
  if (!health.ok) throw new Error(`Staging PocketBase not available at ${TARGET}`);
  console.log(`✓ Staging PocketBase healthy`);

  // Admin auth
  const auth = await pbJson("POST", `${TARGET}/api/admins/auth-with-password`, {
    identity: admin.email,
    password: admin.password,
  });
  if (!auth.data?.token) {
    throw new Error("Staging admin authentication failed. Check POCKETBASE_STAGING_ADMIN_EMAIL / _PASSWORD.");
  }
  const token = auth.data.token;
  console.log("✓ Staging admin authenticated");

  // Get users collection ID for relations
  const usersRes = await pbJson("GET", `${TARGET}/api/collections/users`, null, token);
  if (!usersRes.ok) throw new Error("Cannot read users collection from staging");
  const USERS_ID = usersRes.data.id;
  console.log(`✓ users collection id: ${USERS_ID}`);

  // Audit existing collections
  const colsRes = await pbJson("GET", `${TARGET}/api/collections?perPage=200`, null, token);
  const existingNames = (colsRes.data.items || []).map((c) => c.name);
  console.log("\n── Current staging collections ─────────────────────────────");
  console.log("  Count:", existingNames.length);
  const requiredCollections = [
    "notifications", "push_tokens",
    // Rating, Reporting, Findings, Leave, Attachment
    "hr_rating_periods", "hr_rating_assignments", "hr_rating_aspects",
    "hr_rating_reviewers", "hr_rating_scores", "hr_rating_results",
    "hr_staff_reports", "hr_findings", "hr_case_attachments",
    "leave_requests", "users", "profiles",
  ];
  for (const req of requiredCollections) {
    const present = existingNames.includes(req);
    console.log(`  ${present ? "✓" : "✗"} ${req}`);
  }

  console.log("\n── notifications ─────────────────────────────────────────────");
  await ensureCollection(
    token,
    "notifications",
    [
      relationField("recipient", USERS_ID, true),
      textField("type", true),
      textField("title"),
      textField("body"),
      textField("resource_type"),
      textField("resource_id"),
      textField("action"),
      dateField("read_at"),
      textField("idempotency_key"),
    ],
    {
      listRule: "@request.auth.id = recipient",
      viewRule: "@request.auth.id = recipient",
      createRule: null,
      updateRule: "@request.auth.id = recipient",
      deleteRule: null,
    },
  );

  console.log("\n── push_tokens ───────────────────────────────────────────────");
  await ensureCollection(
    token,
    "push_tokens",
    [
      relationField("user", USERS_ID, true),
      textField("token", true),
      selectField("platform", ["android", "ios"]),
      textField("device_id"),
      boolField("is_active"),
      dateField("last_seen"),
    ],
    {
      listRule: "@request.auth.id = user",
      viewRule: "@request.auth.id = user",
      createRule: '@request.auth.id != ""',
      updateRule: "@request.auth.id = user",
      deleteRule: null,
    },
  );

  // Final verification
  console.log("\n── Verifying applied schema ──────────────────────────────────");
  const notifRes = await pbJson("GET", `${TARGET}/api/collections/notifications`, null, token);
  const ptRes = await pbJson("GET", `${TARGET}/api/collections/push_tokens`, null, token);

  if (!notifRes.ok) throw new Error("notifications collection not found after migration");
  if (!ptRes.ok) throw new Error("push_tokens collection not found after migration");

  const notif = notifRes.data;
  const pt = ptRes.data;

  console.log("notifications:");
  console.log(`  listRule: ${notif.listRule}`);
  console.log(`  viewRule: ${notif.viewRule}`);
  console.log(`  createRule: ${notif.createRule}`);
  console.log(`  updateRule: ${notif.updateRule}`);
  console.log(`  fields: ${notif.schema.map((f) => f.name).join(", ")}`);

  console.log("push_tokens:");
  console.log(`  listRule: ${pt.listRule}`);
  console.log(`  viewRule: ${pt.viewRule}`);
  console.log(`  createRule: ${pt.createRule}`);
  console.log(`  updateRule: ${pt.updateRule}`);
  console.log(`  fields: ${pt.schema.map((f) => f.name).join(", ")}`);

  // Schema correctness checks
  const fails = [];
  if (notif.listRule !== "@request.auth.id = recipient") fails.push("notifications.listRule incorrect");
  if (notif.viewRule !== "@request.auth.id = recipient") fails.push("notifications.viewRule incorrect");
  if (notif.createRule !== null) fails.push("notifications.createRule must be null (server-only)");
  if (pt.listRule !== "@request.auth.id = user") fails.push("push_tokens.listRule incorrect");
  if (pt.viewRule !== "@request.auth.id = user") fails.push("push_tokens.viewRule incorrect");
  if (pt.createRule !== '@request.auth.id != ""') fails.push("push_tokens.createRule incorrect");

  const requiredNotifFields = ["recipient", "type", "title", "body", "resource_type", "resource_id", "action", "read_at", "idempotency_key"];
  const requiredPtFields = ["user", "token", "platform", "device_id", "is_active", "last_seen"];

  const notifFieldNames = notif.schema.map((f) => f.name);
  const ptFieldNames = pt.schema.map((f) => f.name);

  for (const f of requiredNotifFields) {
    if (!notifFieldNames.includes(f)) fails.push(`notifications missing field: ${f}`);
  }
  for (const f of requiredPtFields) {
    if (!ptFieldNames.includes(f)) fails.push(`push_tokens missing field: ${f}`);
  }

  if (fails.length > 0) {
    console.log("\n✗ SCHEMA VERIFICATION FAILED:");
    for (const f of fails) console.log("  -", f);
    process.exit(1);
  }

  console.log("\n✓ Phase 25 staging notification schema migration COMPLETE");
  console.log("  notifications: user-scoped listRule/viewRule, createRule=null");
  console.log("  push_tokens: user-scoped, createRule=authenticated");
  console.log("  Production: UNTOUCHED");
}

migrate().catch((e) => {
  console.error("\nMigration FAILED:", e.message);
  process.exit(1);
});
