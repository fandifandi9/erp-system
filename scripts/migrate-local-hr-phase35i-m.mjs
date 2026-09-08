/**
 * LOCAL-ONLY Phase 35I-M — Attendance unique day + write-locks for attendance/OT/field.
 * Run: npm run migrate:local-hr-phase35i-m
 *
 * - UNIQUE (user, date) on attendance_logs → idx_attendance_one_day_user
 * - attendance_logs create/update/delete = null
 * - overtime_requests create/update/delete = null
 * - field_activity_requests create/update/delete = null (mutations via Next API)
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

const INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS `idx_attendance_one_day_user` ON `attendance_logs` (`user`, `date`)";

async function lockCollection(token, name) {
  const colRes = await pbJson("GET", `/api/collections/${name}`, null, token);
  if (!colRes.ok) {
    console.warn(`SKIP lock — ${name} missing`);
    return;
  }
  const col = colRes.data;
  const payload = {
    listRule: col.listRule || LIST_SELF_HR,
    viewRule: col.viewRule || LIST_SELF_HR,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  };
  const patch = await pbJson("PATCH", `/api/collections/${col.id}`, payload, token);
  if (!patch.ok) throw new Error(`Lock ${name} failed: ${JSON.stringify(patch.data)}`);
  console.log(`LOCKED ${name} create/update/delete=null`);
}

async function main() {
  console.log("=== LOCAL migrate Phase 35I-M attendance/OT/field harden ===");
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

  // Pre-check duplicate (user, date)
  const attRes = await pbJson(
    "GET",
    `/api/collections/attendance_logs/records?perPage=500&fields=id,user,date`,
    null,
    token,
  );
  if (attRes.ok) {
    const items = attRes.data.items || [];
    const seen = new Map();
    const dups = [];
    for (const row of items) {
      const key = `${row.user}|${String(row.date).slice(0, 10)}`;
      if (seen.has(key)) dups.push(key);
      else seen.set(key, row.id);
    }
    if (dups.length) {
      console.error("ABORT — duplicate attendance (user,date):", dups.slice(0, 20));
      process.exit(1);
    }
  }

  const colAtt = await pbJson("GET", "/api/collections/attendance_logs", null, token);
  if (!colAtt.ok) throw new Error("attendance_logs missing");
  const indexes = Array.isArray(colAtt.data.indexes) ? [...colAtt.data.indexes] : [];
  if (!indexes.some((x) => String(x).includes("idx_attendance_one_day_user"))) {
    indexes.push(INDEX_SQL);
    const patchIdx = await pbJson(
      "PATCH",
      `/api/collections/${colAtt.data.id}`,
      { ...colAtt.data, indexes },
      token,
    );
    if (!patchIdx.ok) {
      console.warn("Unique index PATCH failed (may already exist):", JSON.stringify(patchIdx.data));
    } else {
      console.log("INDEX idx_attendance_one_day_user applied");
    }
  } else {
    console.log("INDEX already present");
  }

  await lockCollection(token, "attendance_logs");
  await lockCollection(token, "overtime_requests");
  await lockCollection(token, "field_activity_requests");

  console.log("RESULT: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
