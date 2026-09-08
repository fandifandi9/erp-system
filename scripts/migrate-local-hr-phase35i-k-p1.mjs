/**
 * LOCAL-ONLY Phase 35I-K-P1 — One-active assignment unique index (SQLite partial).
 * Run: npm run migrate:local-hr-phase35i-k-p1
 *
 * Adds:
 *   CREATE UNIQUE INDEX idx_hr_org_assign_one_active_user
 *   ON hr_employee_org_assignments (user) WHERE is_active = TRUE
 *
 * Aborts if duplicate active assignments exist (run audit first).
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

const INDEX_SQL =
  "CREATE UNIQUE INDEX `idx_hr_org_assign_one_active_user` ON `hr_employee_org_assignments` (`user`) WHERE `is_active` IS TRUE";

async function main() {
  console.log("=== LOCAL migrate Phase 35I-K-P1 one-active unique index ===");
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

  const colRes = await pbJson("GET", "/api/collections/hr_employee_org_assignments", null, token);
  if (!colRes.ok) throw new Error("hr_employee_org_assignments missing — run 35I-F3 first");

  // Pre-check duplicates (read-only)
  const activeRes = await pbJson(
    "GET",
    `/api/collections/hr_employee_org_assignments/records?perPage=500&filter=${encodeURIComponent("is_active=true")}`,
    null,
    token,
  );
  const items = activeRes.data?.items || [];
  const byUser = {};
  for (const a of items) {
    const u = typeof a.user === "string" ? a.user : a.user?.id;
    if (!u) continue;
    byUser[u] = (byUser[u] || 0) + 1;
  }
  const conflicts = Object.entries(byUser).filter(([, n]) => n > 1);
  if (conflicts.length) {
    console.error("ABORT — duplicate active assignments exist. Run audit:local-hr-org-consistency first.");
    console.error(JSON.stringify(conflicts.slice(0, 20)));
    process.exit(1);
  }
  console.log("  · no duplicate active users — OK");

  const col = colRes.data;
  const indexes = Array.isArray(col.indexes) ? [...col.indexes] : [];
  if (indexes.some((ix) => String(ix).includes("idx_hr_org_assign_one_active_user"))) {
    console.log("  · index already present");
    console.log("=== DONE ===");
    return;
  }

  indexes.push(INDEX_SQL);
  const patched = await pbJson(
    "PATCH",
    `/api/collections/${col.id}`,
    { ...col, indexes },
    token,
  );
  if (!patched.ok) {
    console.error("INDEX CREATE FAILED — PocketBase may not accept partial UNIQUE INDEX.");
    console.error(JSON.stringify(patched.data).slice(0, 600));
    console.error("");
    console.error("LIMITATION: Application-level race mitigation remains in createOrgAssignment.");
    console.error("Do NOT invent unsafe workarounds. Report this to the team.");
    process.exit(1);
  }
  console.log("  ✓ idx_hr_org_assign_one_active_user added");
  console.log("=== DONE (local only) ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
