/**
 * LOCAL-ONLY Phase NEXT — hr_absence_requests (Izin/Off separate from field_activity).
 * Run: npm run migrate:local-hr-phase-next-izin-off
 *
 * NO production / serba.space / :8091 / :8092.
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local missing");
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

function textField(name, required = false) {
  return { name, type: "text", required, system: false, options: { min: null, max: null, pattern: "" } };
}
function dateField(name, required = false) {
  return { name, type: "date", required, system: false, options: { min: "", max: "" } };
}
function selectField(name, values, required = false) {
  return {
    name,
    type: "select",
    required,
    system: false,
    options: { maxSelect: 1, values },
  };
}
function relationField(name, collectionId, required = false) {
  return {
    name,
    type: "relation",
    required,
    system: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: null,
      maxSelect: 1,
      displayFields: null,
    },
  };
}

function ensureFields(schema, extras) {
  const names = new Set((schema || []).map((f) => f.name));
  const next = [...(schema || [])];
  let changed = false;
  for (const f of extras) {
    if (!names.has(f.name)) {
      next.push(f);
      changed = true;
      console.log(`  + field ${f.name}`);
    } else {
      console.log(`  OK: ${f.name}`);
    }
  }
  return { schema: next, changed };
}

const { url, email, pass } = loadEnv();
if (!url || !email || !pass || url.includes("serba.space") || url.includes(":8091") || url.includes(":8092")) {
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
  process.exit(1);
}

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const LIST_SELF_HR =
  '@request.auth.id != "" && (user = @request.auth.id || @request.auth.role = "hr" || @request.auth.role_code = "hr" || @request.auth.role = "owner" || @request.auth.role_code = "owner" || @request.auth.account_type = "owner")';

async function main() {
  console.log("=== LOCAL migrate Phase NEXT Izin/Off (hr_absence_requests) ===");
  console.log("PB:", url);

  let auth = await pbJson("POST", "/api/collections/_superusers/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) {
    auth = await pbJson("POST", "/api/admins/auth-with-password", {
      identity: email,
      password: pass,
    });
  }
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  if (!usersCol.ok) throw new Error("users collection missing");
  const usersId = usersCol.data.id;

  let companiesId = null;
  const companiesCol = await pbJson("GET", "/api/collections/biz_companies", null, token);
  if (companiesCol.ok) companiesId = companiesCol.data.id;

  const name = "hr_absence_requests";
  let col = await pbJson("GET", `/api/collections/${name}`, null, token);

  const fields = [
    relationField("user", usersId, true),
    ...(companiesId ? [relationField("company", companiesId, false)] : []),
    selectField("type", ["izin", "off"], true),
    dateField("start_date", true),
    dateField("end_date", true),
    textField("reason", true),
    selectField("status", ["pending", "approved", "rejected", "cancelled"], true),
    textField("rejection_reason", false),
    textField("hr_action_by", false),
    textField("hr_action_name", false),
    textField("hr_action_at", false),
    textField("division", false),
  ];

  if (!col.ok) {
    const create = await pbJson(
      "POST",
      "/api/collections",
      {
        name,
        type: "base",
        listRule: LIST_SELF_HR,
        viewRule: LIST_SELF_HR,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        schema: fields,
      },
      token,
    );
    if (!create.ok) throw new Error(`Create ${name} failed: ${JSON.stringify(create.data)}`);
    console.log(`CREATED ${name} (write-locked)`);
  } else {
    const { schema, changed } = ensureFields(col.data.schema || col.data.fields || [], fields);
    const payload = {
      listRule: LIST_SELF_HR,
      viewRule: LIST_SELF_HR,
      createRule: null,
      updateRule: null,
      deleteRule: null,
    };
    if (changed) {
      if (Array.isArray(col.data.fields)) payload.fields = schema;
      else payload.schema = schema;
    }
    const patch = await pbJson("PATCH", `/api/collections/${col.data.id}`, payload, token);
    if (!patch.ok) throw new Error(`Patch ${name} failed: ${JSON.stringify(patch.data)}`);
    console.log(`UPDATED ${name} write-lock + fields`);
  }

  console.log("RESULT: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
