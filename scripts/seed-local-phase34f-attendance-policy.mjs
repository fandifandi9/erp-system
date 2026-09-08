/**
 * LOCAL-ONLY Phase 34F: seed structured attendance policy for FN2 UAT.
 * - Rp500/min effective 2026-06-01 (covers existing demo payslips)
 * - Rp1000/min effective 2026-09-01 (propagation test — future payroll)
 *
 * Run: npm run seed:local-phase34f-attendance-policy
 */

import fs from "fs";
import path from "path";

const TARGET_EMAIL = "fn2@gmail.com";
const DEMO_PREFIX = "phase34f-uat";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) throw new Error(".env.local missing");
  const text = fs.readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}=(.*)$`, "m"));
    if (!m) return "";
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
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
  console.error("BLOCKED — LOCAL PocketBase only");
  process.exit(1);
}

async function pbJson(method, pathSuffix, body, token) {
  const res = await fetch(`${url}${pathSuffix}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function pbEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function findByDemoKey(token, key) {
  const res = await pbJson(
    "GET",
    `/api/collections/hr_entity_attendance_policies/records?filter=${encodeURIComponent(
      `demo_seed_key = "${pbEscape(key)}"`,
    )}&perPage=1`,
    null,
    token,
  );
  return res.data.items?.[0] ?? null;
}

async function findUser(token, targetEmail) {
  const res = await pbJson(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email = "${pbEscape(targetEmail)}"`)}&perPage=1`,
    null,
    token,
  );
  return res.data.items?.[0] ?? null;
}

async function resolvePrimaryCompany(token, userId) {
  const res = await pbJson(
    "GET",
    `/api/collections/biz_user_companies/records?filter=${encodeURIComponent(
      `user = "${pbEscape(userId)}" && is_primary = true`,
    )}&expand=company&perPage=1`,
    null,
    token,
  );
  const row = res.data.items?.[0];
  return row?.expand?.company?.id ?? row?.company ?? null;
}

async function ensurePolicy(token, companyId, spec) {
  if (await findByDemoKey(token, spec.key)) {
    console.log(`  = policy ${spec.key} (exists)`);
    return;
  }
  const created = await pbJson(
    "POST",
    "/api/collections/hr_entity_attendance_policies/records",
    {
      company_id: companyId || "",
      status: "published",
      effective_from: spec.effective_from,
      effective_until: spec.effective_until || "",
      late_enabled: true,
      late_grace_minutes: spec.grace,
      late_rate_per_minute: spec.late_rate,
      absence_enabled: true,
      absence_rate_per_day: spec.absence_rate,
      notes: spec.notes,
      is_demo: true,
      demo_seed_key: spec.key,
    },
    token,
  );
  if (!created.ok) throw new Error(`${spec.key}: ${JSON.stringify(created.data).slice(0, 300)}`);
  console.log(`  + policy ${spec.key} (late Rp${spec.late_rate}/min, absence Rp${spec.absence_rate}/day)`);
}

async function main() {
  console.log("Phase 34F attendance policy seed — FN2 / PT. Serba Digital Indonesia");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const user = await findUser(token, TARGET_EMAIL);
  if (!user) {
    console.error(`STOP — ${TARGET_EMAIL} not found`);
    process.exit(2);
  }

  const companyId = await resolvePrimaryCompany(token, user.id);
  if (!companyId) {
    console.error("STOP — FN2 primary company not found");
    process.exit(2);
  }
  console.log(`Company: ${companyId}`);

  await ensurePolicy(token, companyId, {
    key: `${DEMO_PREFIX}:policy-500`,
    effective_from: "2026-06-01",
    effective_until: "2026-08-31",
    grace: 0,
    late_rate: 500,
    absence_rate: 100000,
    notes: "UAT policy Jun–Aug 2026 — Rp500/min, Rp100k/day alpha",
  });

  await ensurePolicy(token, companyId, {
    key: `${DEMO_PREFIX}:policy-1000`,
    effective_from: "2026-09-01",
    grace: 0,
    late_rate: 1000,
    absence_rate: 100000,
    notes: "UAT policy Sep 2026+ — Rp1000/min (propagation test)",
  });

  console.log("\nAttendance policy seed complete.");
  console.log("Verify: staff policies page shows Rp500/min; after Sep 2026 shows Rp1000/min.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
