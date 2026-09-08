/**
 * LOCAL-ONLY Phase 35I-J — Recruitment appointment approval queue.
 * Run: npm run migrate:local-hr-phase35i-j
 *
 * Additive: collection hr_recruitment_requests
 * NO production / serba.space.
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
function dateField(name) {
  return { name, type: "date", required: false, system: false, options: { min: "", max: "" } };
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

async function patchCollection(token, name, patch) {
  const existing = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (!existing.ok) throw new Error(`Collection missing: ${name}`);
  const col = existing.data;
  const r = await pbJson("PATCH", `/api/collections/${col.id}`, { ...col, ...patch }, token);
  if (!r.ok) throw new Error(`PATCH ${name}: ${JSON.stringify(r.data).slice(0, 400)}`);
}

const LOCKED = {
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

async function main() {
  console.log("=== LOCAL migrate Phase 35I-J recruitment requests ===");
  console.log("PB:", url);

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) {
    // PB0.23+
    const auth2 = await pbJson("POST", "/api/collections/_superusers/auth-with-password", {
      identity: email,
      password: pass,
    });
    if (!auth2.ok) throw new Error("Admin auth failed");
    var token = auth2.data.token;
  } else {
    var token = auth.data.token;
  }

  const usersCol = await pbJson("GET", "/api/collections/users", null, token);
  const companiesCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  const positionsCol = await pbJson("GET", "/api/collections/hr_org_positions", null, token);
  const profilesCol = await pbJson("GET", "/api/collections/profiles", null, token);
  if (!usersCol.ok || !companiesCol.ok || !positionsCol.ok) {
    throw new Error("Prerequisite collections missing (users / biz_company_profile / hr_org_positions)");
  }

  const usersId = usersCol.data.id;
  const companiesId = companiesCol.data.id;
  const positionsId = positionsCol.data.id;
  const profilesId = profilesCol.ok ? profilesCol.data.id : null;

  let col = await pbJson("GET", "/api/collections/hr_recruitment_requests", null, token);
  if (!col.ok) {
    const schema = [
      relationField("candidate_user", usersId, true),
      textField("candidate_name", true),
      textField("candidate_email", false),
      relationField("company", companiesId, true),
      relationField("org_position", positionsId, true),
      textField("org_position_name", false),
      ...(profilesId ? [relationField("profile", profilesId, false)] : []),
      relationField("requested_by", usersId, true),
      textField("status", true),
      relationField("reviewed_by", usersId, false),
      dateField("reviewed_at"),
      textField("decision", false),
      textField("rejection_reason", false),
      textField("notes", false),
    ];
    const created = await pbJson(
      "POST",
      "/api/collections",
      {
        name: "hr_recruitment_requests",
        type: "base",
        schema,
        ...LOCKED,
      },
      token,
    );
    if (!created.ok) {
      throw new Error(`CREATE hr_recruitment_requests: ${JSON.stringify(created.data).slice(0, 500)}`);
    }
    console.log("  ✓ hr_recruitment_requests created");
  } else {
    console.log("  · hr_recruitment_requests exists");
    const extras = [
      relationField("candidate_user", usersId, true),
      textField("candidate_name", true),
      textField("candidate_email", false),
      relationField("company", companiesId, true),
      relationField("org_position", positionsId, true),
      textField("org_position_name", false),
      ...(profilesId ? [relationField("profile", profilesId, false)] : []),
      relationField("requested_by", usersId, true),
      textField("status", true),
      relationField("reviewed_by", usersId, false),
      dateField("reviewed_at"),
      textField("decision", false),
      textField("rejection_reason", false),
      textField("notes", false),
    ];
    const { schema, changed } = ensureFields(col.data.schema || col.data.fields || [], extras);
    if (changed) {
      await patchCollection(token, "hr_recruitment_requests", { schema, ...LOCKED });
      console.log("  ✓ schema updated");
    }
  }

  console.log("=== DONE (local only) ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
