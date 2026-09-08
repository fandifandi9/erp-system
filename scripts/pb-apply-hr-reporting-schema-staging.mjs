/**
 * Phase 13 — Apply HR Reports/Findings collections to STAGING PocketBase only.
 *
 * Usage:
 *   npm run pb:hr-reporting-schema:staging
 *
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

console.log("=== Phase 13 HR Reports/Findings schema (STAGING ONLY) ===");
console.log("TARGET", TARGET);

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

function fileField(name, idPrefix) {
  return {
    system: false,
    id: fieldId(idPrefix),
    name,
    type: "file",
    required: true,
    presentable: false,
    unique: false,
    options: {
      maxSelect: 1,
      maxSize: 10485760,
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
      thumbs: ["128x128"],
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

function caseSchema(prefix) {
  return [
    textField("title", `${prefix}t`, true),
    textField("body", `${prefix}b`, true),
    selectField("category", `${prefix}c`, ["facility", "safety", "misconduct", "operations", "other"], true),
    selectField("status", `${prefix}s`, ["draft", "submitted", "in_review", "closed"], true),
    selectField("priority", `${prefix}p`, ["low", "medium", "high"], true),
    textField("location_text", `${prefix}l`, false),
    relationField("created_by", usersId, `${prefix}cb`, true),
    textField("company_id", `${prefix}co`, false),
    textField("hr_note", `${prefix}n`, false),
    dateField("submitted_at", `${prefix}sa`, false),
    dateField("closed_at", `${prefix}ca`, false),
    relationField("closed_by", usersId, `${prefix}cl`, false),
  ];
}

await ensureCollection("hr_staff_reports", caseSchema("hsr"));
await ensureCollection("hr_findings", caseSchema("hfn"));
await ensureCollection("hr_case_attachments", [
  selectField("kind", "hcak", ["report", "finding"], true),
  textField("parent_id", "hcap", true),
  fileField("file", "hcaf"),
  textField("original_name", "hcan", false),
  textField("mime", "hcam", false),
  numberField("size", "hcas", false),
  relationField("created_by", usersId, "hcacb", false),
]);

console.log("=== Phase 13 schema applied (staging only). Production untouched. ===");
