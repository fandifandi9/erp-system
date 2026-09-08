/**
 * LOCAL-ONLY Phase 35I-F3 — Per-entity org assignments + position scope.
 * Run: npm run migrate:local-hr-phase35i-f3
 *
 * Additive only:
 * - collection hr_employee_org_assignments
 * - hr_org_positions.scope_type, scope_company_ids
 * - optional backfill from profiles.org_position_id (safe SELECTED=[company])
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
function boolField(name) {
  return { name, type: "bool", required: false, system: false, options: {} };
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

function pbEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function main() {
  console.log("Phase 35I-F3 migration — org assignments + position scope\n");

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
  const usersId = usersCol.data.id;
  const companyCol = await pbJson("GET", "/api/collections/biz_company_profile", null, token);
  if (!companyCol.ok) throw new Error("biz_company_profile missing");
  const companyId = companyCol.data.id;
  const positionsCol = await pbJson("GET", "/api/collections/hr_org_positions", null, token);
  if (!positionsCol.ok) throw new Error("hr_org_positions missing — run 35I-D first");
  const positionsId = positionsCol.data.id;

  const LOCKED = {
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };

  // Position scope fields
  const { schema: posSchema, changed: posChanged } = ensureFields(positionsCol.data.schema, [
    textField("scope_type"),
    textField("scope_company_ids"),
  ]);
  if (posChanged) {
    await patchCollection(token, "hr_org_positions", { schema: posSchema, ...LOCKED });
    console.log("  ✓ hr_org_positions scope fields updated");
  }

  // Backfill scope_type for positions missing it → SELECTED = [company]
  const allPos = await pbJson(
    "GET",
    "/api/collections/hr_org_positions/records?perPage=500",
    null,
    token,
  );
  let scopeBackfill = 0;
  for (const rec of allPos.data?.items || []) {
    if (String(rec.scope_type || "").trim()) continue;
    const cid =
      typeof rec.company === "string"
        ? rec.company
        : rec.company?.id || "";
    await pbJson(
      "PATCH",
      `/api/collections/hr_org_positions/records/${rec.id}`,
      {
        scope_type: "SELECTED_COMPANIES",
        scope_company_ids: JSON.stringify(cid ? [cid] : []),
      },
      token,
    );
    scopeBackfill += 1;
  }
  console.log(`  · position scope backfill: ${scopeBackfill}`);

  // Assignments collection
  let assignCol = await pbJson("GET", "/api/collections/hr_employee_org_assignments", null, token);
  if (!assignCol.ok) {
    const created = await pbJson(
      "POST",
      "/api/collections",
      {
        name: "hr_employee_org_assignments",
        type: "base",
        schema: [
          relationField("user", usersId, true),
          relationField("company", companyId, true),
          relationField("org_position", positionsId, true),
          boolField("is_active"),
          textField("status"),
          dateField("effective_from"),
          dateField("effective_to"),
          textField("created_by"),
          textField("updated_by"),
          textField("notes"),
        ],
        ...LOCKED,
      },
      token,
    );
    if (!created.ok) {
      throw new Error(`CREATE hr_employee_org_assignments: ${JSON.stringify(created.data).slice(0, 400)}`);
    }
    console.log("  ✓ hr_employee_org_assignments created");
    assignCol = await pbJson("GET", "/api/collections/hr_employee_org_assignments", null, token);
  } else {
    console.log("  · hr_employee_org_assignments exists");
    const { schema: aSchema, changed: aChanged } = ensureFields(assignCol.data.schema, [
      relationField("user", usersId, true),
      relationField("company", companyId, true),
      relationField("org_position", positionsId, true),
      boolField("is_active"),
      textField("status"),
      dateField("effective_from"),
      dateField("effective_to"),
      textField("created_by"),
      textField("updated_by"),
      textField("notes"),
    ]);
    if (aChanged) {
      await patchCollection(token, "hr_employee_org_assignments", { schema: aSchema, ...LOCKED });
      console.log("  ✓ hr_employee_org_assignments schema updated");
    }
  }

  // Safe backfill from profiles.org_position_id
  const profiles = await pbJson("GET", "/api/collections/profiles/records?perPage=500", null, token);
  let assignBackfill = 0;
  for (const profile of profiles.data?.items || []) {
    const posId = String(profile.org_position_id || "").trim();
    if (!posId) continue;
    const userId =
      typeof profile.user === "string" ? profile.user : profile.user?.id || "";
    if (!userId) continue;

    const posRes = await pbJson(
      "GET",
      `/api/collections/hr_org_positions/records/${posId}`,
      null,
      token,
    );
    if (!posRes.ok) continue;
    const company =
      typeof posRes.data.company === "string"
        ? posRes.data.company
        : posRes.data.company?.id || "";
    if (!company) continue;

    const existing = await pbJson(
      "GET",
      `/api/collections/hr_employee_org_assignments/records?filter=${encodeURIComponent(
        `user = "${pbEscape(userId)}" && company = "${pbEscape(company)}" && is_active = true`,
      )}&perPage=1`,
      null,
      token,
    );
    if ((existing.data?.items || []).length > 0) continue;

    const created = await pbJson(
      "POST",
      "/api/collections/hr_employee_org_assignments/records",
      {
        user: userId,
        company,
        org_position: posId,
        is_active: true,
        status: "active",
        effective_from: new Date().toISOString().slice(0, 10),
        effective_to: "",
        created_by: "migration:35i-f3",
        updated_by: "migration:35i-f3",
        notes: "backfill from profiles.org_position_id",
      },
      token,
    );
    if (created.ok) {
      assignBackfill += 1;
      // sync holder cache
      await pbJson(
        "PATCH",
        `/api/collections/hr_org_positions/records/${posId}`,
        { holder_user: userId },
        token,
      );
    }
  }
  console.log(`  · assignment backfill from profiles: ${assignBackfill}`);

  console.log("\nPhase 35I-F3 local migration OK (additive only).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
