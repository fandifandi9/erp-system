/**
 * Phase 12 — Apply HR Rating collections to STAGING PocketBase only.
 *
 * Usage:
 *   npm run pb:hr-rating-schema:staging
 *
 * Uses Node http (keepAlive off) — undici fetch often ECONNRESET over ssh -L tunnels.
 * Never targets production hosts.
 */
import {
  assertStagingOnly,
  loadStagingEnv,
  requireStagingAdmin,
} from "./lib/staging-guard.mjs";
import { stagingJson } from "./lib/staging-http.mjs";

const env = loadStagingEnv();
const { url: TARGET } = assertStagingOnly(env, env.POCKETBASE_STAGING_URL);
const admin = requireStagingAdmin(env);

console.log("=== Phase 12 HR Rating schema (STAGING ONLY) ===");
console.log("TARGET", TARGET);
console.log("Transport: node:http keepAlive=false Connection=close (tunnel-safe)");

// Preflight — same path curl uses
{
  const health = await stagingJson("GET", `${TARGET}/api/health`, {
    label: "GET /api/health",
    retries: 5,
  });
  console.log("[OK] health", health.status, JSON.stringify(health.json).slice(0, 100));
  if (health.status !== 200) {
    console.error("BLOCKED — staging health not 200");
    process.exit(1);
  }
}

const auth = await stagingJson("POST", `${TARGET}/api/admins/auth-with-password`, {
  label: "POST /api/admins/auth-with-password",
  body: { identity: admin.email, password: admin.password },
  retries: 4,
});
if (auth.status !== 200 || !auth.json.token) {
  console.error("Staging admin auth failed", auth.status, auth.json?.message || "");
  process.exit(1);
}
console.log("[OK] staging admin authenticated");
const token = auth.json.token;

function fieldId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 15);
}

function textField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "text",
    required,
    presentable: false,
    unique: false,
    options: { min: null, max: null, pattern: "" },
  };
}

function numberField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "number",
    required,
    presentable: false,
    unique: false,
    options: { min: null, max: null, noDecimal: false },
  };
}

function boolField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "bool",
    required: false,
    presentable: false,
    unique: false,
    options: {},
  };
}

function dateField(name, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "date",
    required,
    presentable: false,
    unique: false,
    options: { min: "", max: "" },
  };
}

function selectField(name, idPrefix, values, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "select",
    required,
    presentable: false,
    unique: false,
    options: { maxSelect: 1, values },
  };
}

function relationField(name, collectionId, idPrefix, required = false) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "relation",
    required,
    presentable: false,
    unique: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
}

function ensureField(schema, field) {
  const idx = schema.findIndex((f) => f.name === field.name);
  if (idx < 0) {
    schema.push(field);
    return true;
  }
  return false;
}

/** Superuser-only rules (null) — all access via Next.js admin PB. PB 0.22 compatible. */
const LOCKED_RULES = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

async function getCollectionId(name) {
  const res = await stagingJson("GET", `${TARGET}/api/collections/${name}`, {
    token,
    label: `GET /api/collections/${name}`,
  });
  if (res.status !== 200 || !res.json.id) {
    throw new Error(`Collection ${name} not found (HTTP ${res.status})`);
  }
  return res.json.id;
}

async function ensureCollection(name, schema) {
  const existingRes = await stagingJson("GET", `${TARGET}/api/collections/${name}`, {
    token,
    label: `GET collection ${name}`,
  });

  if (existingRes.status === 200 && existingRes.json.id) {
    const existing = existingRes.json;
    const fields = [...(existing.schema ?? existing.fields ?? [])];
    let changed = false;
    for (const f of schema) {
      if (ensureField(fields, f)) changed = true;
    }
    const body = { ...LOCKED_RULES };
    if (changed) body.schema = fields;
    const patchRes = await stagingJson("PATCH", `${TARGET}/api/collections/${existing.id}`, {
      token,
      body,
      label: `PATCH collection ${name}`,
    });
    if (patchRes.status < 200 || patchRes.status >= 300) {
      console.error(`PATCH ${name} failed`, patchRes.status, patchRes.json);
      process.exit(1);
    }
    console.log(`[OK] ${name} ${changed ? "fields+rules" : "rules"} updated`);
    return existing.id;
  }

  // PocketBase 0.22: POST /api/collections with schema[] + rule fields
  const createRes = await stagingJson("POST", `${TARGET}/api/collections`, {
    token,
    body: {
      name,
      type: "base",
      ...LOCKED_RULES,
      schema,
    },
    label: `POST create ${name}`,
  });
  if (createRes.status < 200 || createRes.status >= 300 || !createRes.json.id) {
    console.error(`Create ${name} failed`, createRes.status, createRes.json);
    process.exit(1);
  }
  console.log(`[OK] ${name} created`);
  return createRes.json.id;
}

const usersId = await getCollectionId("users");

const periodsId = await ensureCollection("hr_rating_periods", [
  textField("name", "hrpn", true),
  dateField("start_date", "hrpsd", true),
  dateField("end_date", "hrped", true),
  selectField(
    "status",
    "hrpst",
    ["draft", "open", "in_progress", "closed", "cancelled"],
    true,
  ),
  textField("description", "hrpdes", false),
  relationField("created_by", usersId, "hrpcb", false),
]);

const aspectsId = await ensureCollection("hr_rating_aspects", [
  textField("code", "hrac", true),
  textField("name", "hran", true),
  textField("description", "hrad", false),
  numberField("sort_order", "hraso", false),
  boolField("is_active", "hraia"),
  numberField("min_score", "hramn", false),
  numberField("max_score", "hramx", false),
]);

const assignmentsId = await ensureCollection("hr_rating_assignments", [
  relationField("period", periodsId, "hrasp", true),
  relationField("subject", usersId, "hrass", true),
  numberField("reviewer_count", "hrarc", true),
  selectField("assignment_method", "hram", ["smart_random", "manual"], true),
  selectField(
    "status",
    "hrast",
    ["draft", "assigned", "in_progress", "completed", "cancelled"],
    true,
  ),
  textField("selection_evidence_json", "hrase", false),
  relationField("created_by", usersId, "hracb", false),
]);

const reviewersId = await ensureCollection("hr_rating_reviewers", [
  relationField("assignment", assignmentsId, "hrrva", true),
  relationField("reviewer", usersId, "hrrvr", true),
  selectField("status", "hrrvs", ["assigned", "draft", "submitted", "locked"], true),
  textField("relevance_tier", "hrrvt", false),
  textField("selection_note", "hrrvn", false),
  dateField("submitted_at", "hrrvsa", false),
]);

await ensureCollection("hr_rating_scores", [
  relationField("reviewer_row", reviewersId, "hrscr", true),
  relationField("aspect", aspectsId, "hrsca", true),
  numberField("score", "hrscs", true),
  textField("comment", "hrscc", false),
]);

await ensureCollection("hr_rating_results", [
  relationField("assignment", assignmentsId, "hrrsa", true),
  numberField("overall_score", "hrrso", true),
  textField("category", "hrrsc", true),
  numberField("respondent_count", "hrrsr", true),
  textField("aspect_scores_json", "hrrsas", false),
  textField("summary", "hrrssm", false),
  textField("strengths", "hrrsst", false),
  textField("improvements", "hrrsim", false),
  textField("suggestions", "hrrssg", false),
  dateField("calculated_at", "hrrsca", false),
]);

const aspectList = await stagingJson(
  "GET",
  `${TARGET}/api/collections/hr_rating_aspects/records?perPage=50`,
  { token, label: "GET aspects records" },
);
if (!(aspectList.json.items || []).length) {
  const defaults = [
    { code: "discipline", name: "Discipline", sort_order: 1 },
    { code: "responsibility", name: "Responsibility", sort_order: 2 },
    { code: "teamwork", name: "Teamwork", sort_order: 3 },
    { code: "communication", name: "Communication", sort_order: 4 },
    { code: "work_quality", name: "Work Quality", sort_order: 5 },
  ];
  for (const d of defaults) {
    const created = await stagingJson(
      "POST",
      `${TARGET}/api/collections/hr_rating_aspects/records`,
      {
        token,
        body: { ...d, is_active: true, min_score: 1, max_score: 5 },
        label: `seed aspect ${d.code}`,
      },
    );
    if (created.status < 200 || created.status >= 300) {
      console.error("Seed aspect failed", d.code, created.status, created.json);
      process.exit(1);
    }
  }
  console.log("[OK] seeded 5 default aspects");
} else {
  console.log("[OK] aspects already present:", aspectList.json.items.length);
}

// Verify collections exist
for (const name of [
  "hr_rating_periods",
  "hr_rating_aspects",
  "hr_rating_assignments",
  "hr_rating_reviewers",
  "hr_rating_scores",
  "hr_rating_results",
]) {
  const v = await stagingJson("GET", `${TARGET}/api/collections/${name}`, {
    token,
    label: `verify ${name}`,
  });
  const rulesOk =
    v.json.createRule == null &&
    v.json.updateRule == null &&
    v.json.deleteRule == null;
  console.log(
    `[VERIFY] ${name} id=${v.json.id} locked=${rulesOk} fields=${(v.json.schema || v.json.fields || []).length}`,
  );
}

console.log("Done. Staging rating schema ready. Production NOT modified.");
console.log("Confirmed target was", TARGET, "(not production).");
