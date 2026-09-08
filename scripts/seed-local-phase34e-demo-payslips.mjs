/**
 * LOCAL-ONLY Phase 34E: idempotent demo payslips for fn2@gmail.com (3 recent months).
 *
 * Run: npm run seed:local-phase34e-demo-payslips
 *
 * STOP if fn2@gmail.com does not exist — does NOT create duplicate users.
 */

import fs from "fs";
import path from "path";

const TARGET_EMAIL = "fn2@gmail.com";
const DEMO_PREFIX = "phase34e-demo-fn2";

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
  console.error("BLOCKED — LOCAL PocketBase only (.env.local :8090)");
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

function lastThreePeriodKeys(now = new Date()) {
  const keys = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    keys.push({ key: `${y}-${m}`, year: y, month: d.getMonth() });
  }
  return keys;
}

function monthBounds(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end), pay: fmt(new Date(year, monthIndex + 1, 5)) };
}

const DEMO_AMOUNTS = [
  { allowance: 500_000, deduction: 100_000, net: 5_400_000 },
  { allowance: 750_000, deduction: 150_000, net: 5_600_000 },
  { allowance: 500_000, deduction: 100_000, net: 5_400_000 },
];

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

async function findUserByEmail(token, targetEmail) {
  const res = await pbJson(
    "GET",
    `/api/collections/users/records?filter=${encodeURIComponent(`email = "${pbEscape(targetEmail)}"`)}&perPage=1`,
    null,
    token,
  );
  if (!res.ok) throw new Error("Failed to query users");
  return res.data.items?.[0] ?? null;
}

async function findProfile(token, userId) {
  const res = await pbJson(
    "GET",
    `/api/collections/profiles/records?filter=${encodeURIComponent(`user = "${pbEscape(userId)}"`)}&perPage=1`,
    null,
    token,
  );
  return res.data.items?.[0] ?? null;
}

async function resolvePrimaryEntity(token, userId) {
  const res = await pbJson(
    "GET",
    `/api/collections/biz_user_companies/records?filter=${encodeURIComponent(
      `user = "${pbEscape(userId)}" && is_active != false`,
    )}&expand=company&sort=-is_primary`,
    null,
    token,
  );
  const rows = res.data.items ?? [];
  const primary = rows.find((r) => r.is_primary === true) ?? rows[0];
  const company = primary?.expand?.company;
  if (!company) {
    return {
      company_id: null,
      company_name_snapshot: "Belum ditentukan",
      company_code_snapshot: "",
      entity_type_snapshot: "",
      company_address_snapshot: "",
      company_npwp_snapshot: "",
    };
  }
  const addr = [company.address, company.city].filter(Boolean).join(", ");
  return {
    company_id: company.id,
    company_name_snapshot: company.company_name || company.legal_name || "—",
    company_code_snapshot: company.code || "",
    entity_type_snapshot: company.entity_type || "",
    company_address_snapshot: addr,
    company_npwp_snapshot: company.npwp || "",
  };
}

async function ensurePayrollSettings(token) {
  const res = await pbJson("GET", "/api/collections/payroll_settings/records?perPage=1", null, token);
  if (res.data.items?.[0]) return res.data.items[0].id;
  const created = await pbJson(
    "POST",
    "/api/collections/payroll_settings/records",
    {
      name: "Default Local",
      attendance_bonus_enabled: false,
      attendance_bonus_amount: 0,
      approved_leave_counts_as_presence: true,
      approved_field_activity_counts_as_presence: true,
      max_unexcused_absence: 3,
      late_policy_enabled: false,
      leave_encashment_enabled: false,
      leave_encashment_rate: 0,
      max_encashable_days_per_cycle: 0,
    },
    token,
  );
  if (!created.ok) throw new Error("Failed to create payroll_settings");
  return created.data.id;
}

async function findDemoPeriod(token, seedKey) {
  const res = await pbJson(
    "GET",
    `/api/collections/payroll_periods/records?filter=${encodeURIComponent(`demo_seed_key = "${pbEscape(seedKey)}"`)}&perPage=1`,
    null,
    token,
  );
  return res.data.items?.[0] ?? null;
}

async function findDemoItem(token, seedKey) {
  const res = await pbJson(
    "GET",
    `/api/collections/payroll_items/records?filter=${encodeURIComponent(`demo_seed_key = "${pbEscape(seedKey)}"`)}&perPage=1`,
    null,
    token,
  );
  return res.data.items?.[0] ?? null;
}

async function main() {
  console.log(`Phase 34E demo payslip seed — target: ${TARGET_EMAIL}`);

  const auth = await pbJson("POST", "/api/admins/auth-with-password", {
    identity: email,
    password: pass,
  });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const user = await findUserByEmail(token, TARGET_EMAIL);
  if (!user) {
    console.error(`STOP — akun ${TARGET_EMAIL} tidak ditemukan di PocketBase lokal.`);
    console.error("Buat akun FN2 terlebih dahulu sebelum menjalankan seed demo.");
    process.exit(2);
  }
  console.log(`Found user: ${user.id} (${user.email})`);

  const profile = await findProfile(token, user.id);
  const entity = await resolvePrimaryEntity(token, user.id);
  console.log(`Primary entity: ${entity.company_name_snapshot}`);

  const settingsId = await ensurePayrollSettings(token);
  const periods = lastThreePeriodKeys();

  let createdPeriods = 0;
  let createdItems = 0;
  let skipped = 0;

  for (let i = 0; i < periods.length; i++) {
    const { key, year, month } = periods[i];
    const bounds = monthBounds(year, month);
    const seedKey = `${DEMO_PREFIX}:${key}`;
    const label = `${MONTH_NAMES_ID[month]} ${year}`;
    const amounts = DEMO_AMOUNTS[i] ?? DEMO_AMOUNTS[DEMO_AMOUNTS.length - 1];
    const base = 5_000_000;
    const gross = base + amounts.allowance;
    const totalDeduction = amounts.deduction;

    let period = await findDemoPeriod(token, seedKey);
    if (!period) {
      const created = await pbJson(
        "POST",
        "/api/collections/payroll_periods/records",
        {
          name: `Demo ${label}`,
          period_key: key,
          start_date: bounds.start,
          end_date: bounds.end,
          pay_date: bounds.pay,
          status: "paid",
          settings: settingsId,
          notes: "LOCAL DEMO UAT Phase 34E — not production payroll",
          is_demo: true,
          demo_seed_key: seedKey,
        },
        token,
      );
      if (!created.ok) throw new Error(`Create period ${seedKey}: ${JSON.stringify(created.data).slice(0, 300)}`);
      period = created.data;
      createdPeriods++;
      console.log(`  + period ${label}`);
    } else {
      console.log(`  = period ${label} (exists)`);
      skipped++;
    }

    let item = await findDemoItem(token, seedKey);
    if (!item) {
      const employeeName =
        profile?.name || profile?.full_name || user.name || user.email || "FN2";
      const payload = {
        period: period.id,
        user: user.id,
        profile: profile?.id || undefined,
        employee_name: employeeName,
        position: profile?.position || "Administrasi",
        division: profile?.division || undefined,
        department_snapshot: profile?.department || "Administrasi Umum",
        employee_code_snapshot: profile?.employee_code || profile?.nik || undefined,
        base_salary: base,
        fixed_allowance: amounts.allowance,
        overtime_amount: 0,
        attendance_bonus_amount: 0,
        attendance_bonus_eligible: false,
        leave_encashment_amount: 0,
        leave_encashment_days: 0,
        extra_bonus_amount: 0,
        extra_bonus_eligible: false,
        late_deduction: 0,
        absence_deduction: amounts.deduction,
        gross_amount: gross,
        total_deduction: totalDeduction,
        net_amount: amounts.net,
        status: "paid",
        is_demo: true,
        demo_seed_key: seedKey,
        company_id: entity.company_id || undefined,
        company_name_snapshot: entity.company_name_snapshot,
        company_code_snapshot: entity.company_code_snapshot || undefined,
        entity_type_snapshot: entity.entity_type_snapshot || undefined,
        company_address_snapshot: entity.company_address_snapshot || undefined,
        company_npwp_snapshot: entity.company_npwp_snapshot || undefined,
      };
      const created = await pbJson("POST", "/api/collections/payroll_items/records", payload, token);
      if (!created.ok) throw new Error(`Create item ${seedKey}: ${JSON.stringify(created.data).slice(0, 300)}`);
      item = created.data;
      createdItems++;
      console.log(`  + item ${label} THP Rp ${amounts.net.toLocaleString("id-ID")}`);
    } else {
      console.log(`  = item ${label} (exists)`);
      skipped++;
    }
  }

  console.log("\nSummary:");
  console.log(`  User: ${TARGET_EMAIL} (${user.id})`);
  console.log(`  Periods created: ${createdPeriods}, items created: ${createdItems}, skipped existing: ${skipped}`);
  console.log("  Re-run safe — no duplicates (demo_seed_key deterministic).");
  console.log("\nREADY FOR LOCAL UAT — open /dashboard-staff/payroll as FN2.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
