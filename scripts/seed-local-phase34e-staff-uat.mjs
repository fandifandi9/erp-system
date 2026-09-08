/**
 * LOCAL-ONLY Phase 34E: seed HR policies, holidays, notifications for FN2 UAT.
 *
 * Run after: npm run migrate:local-hr-phase34e && npm run seed:local-phase34e-demo-payslips
 * Run: npm run seed:local-phase34e-staff-uat
 */

import fs from "fs";
import path from "path";

const TARGET_EMAIL = "fn2@gmail.com";
const DEMO_PREFIX = "phase34e-uat";

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

async function findByDemoKey(token, collection, key) {
  const res = await pbJson(
    "GET",
    `/api/collections/${collection}/records?filter=${encodeURIComponent(`demo_seed_key = "${pbEscape(key)}"`)}&perPage=1`,
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

async function ensureNotification(token, input) {
  if (input.idempotency_key) {
    const existing = await pbJson(
      "GET",
      `/api/collections/notifications/records?filter=${encodeURIComponent(
        `idempotency_key = "${pbEscape(input.idempotency_key)}"`,
      )}&perPage=1`,
      null,
      token,
    );
    if (existing.data.items?.[0]) return existing.data.items[0].id;
  }
  const created = await pbJson("POST", "/api/collections/notifications/records", input, token);
  if (!created.ok) throw new Error(`notification: ${JSON.stringify(created.data).slice(0, 200)}`);
  return created.data.id;
}

async function main() {
  console.log("Phase 34E staff UAT seed — policies, holidays, notifications");

  const auth = await pbJson("POST", "/api/admins/auth-with-password", { identity: email, password: pass });
  if (!auth.ok) throw new Error("Admin auth failed");
  const token = auth.data.token;

  const user = await findUser(token, TARGET_EMAIL);
  if (!user) {
    console.error(`STOP — ${TARGET_EMAIL} not found`);
    process.exit(2);
  }

  const companyId = await resolvePrimaryCompany(token, user.id);
  console.log(`FN2 company: ${companyId ?? "(global)"}`);

  const policies = [
    {
      key: `${DEMO_PREFIX}:policy-late`,
      title: "Aturan Keterlambatan (Demo UAT)",
      category: "keterlambatan",
      content: `Kebijakan keterlambatan PT. Serba Digital Indonesia (DATA UAT / SYNTHETIC):

• Keterlambatan 1–10 menit: dicatat, potongan sesuai tarif per menit yang dikonfigurasi HR.
• Keterlambatan 11–30 menit: potongan dihitung dari tarif per menit × total menit terlambat.
• Keterlambatan lebih dari 30 menit: dapat mempengaruhi bonus kehadiran bulan berjalan.

Potongan keterlambatan dihitung berdasarkan kebijakan perusahaan (bukan rumus universal). Lihat profil payroll / slip gaji untuk rincian aktual.`,
    },
    {
      key: `${DEMO_PREFIX}:policy-absence`,
      title: "Aturan Ketidakhadiran & Cuti (Demo UAT)",
      category: "ketidakhadiran",
      content: `Kebijakan ketidakhadiran (DATA UAT / SYNTHETIC):

• Tidak hadir tanpa keterangan (alpha): potongan absensi harian sesuai kebijakan perusahaan.
• Cuti disetujui: tidak dihitung alpha; dapat mempengaruhi bonus kehadiran sesuai setting payroll.
• Sakit dengan surat dokumen: proses sesuai kebijakan HR.
• Dinas / aktivitas luar kantor yang disetujui: dihitung hadir.

Ajukan cuti melalui modul Cuti sebelum tanggal absensi.`,
    },
  ];

  for (const p of policies) {
    if (await findByDemoKey(token, "hr_policies", p.key)) {
      console.log(`  = policy ${p.title}`);
      continue;
    }
    const created = await pbJson(
      "POST",
      "/api/collections/hr_policies/records",
      {
        title: p.title,
        category: p.category,
        content: p.content,
        status: "published",
        effective_from: new Date().toISOString().slice(0, 10),
        company_id: companyId || "",
        is_demo: true,
        demo_seed_key: p.key,
      },
      token,
    );
    if (!created.ok) throw new Error(`policy ${p.key}: ${JSON.stringify(created.data).slice(0, 300)}`);
    console.log(`  + policy ${p.title}`);
    await ensureNotification(token, {
      recipient: user.id,
      type: "hr.policy.published",
      title: "Kebijakan HR Baru",
      body: `Kebijakan "${p.title}" telah dipublikasikan.`,
      resource_type: "hr_policies",
      resource_id: created.data.id,
      action: "/dashboard-staff/policies",
      idempotency_key: `hr.policy.published:${p.key}:${user.id}`,
    });
  }

  const year = new Date().getFullYear();
  const holidays = [
    {
      key: `${DEMO_PREFIX}:holiday-independence`,
      date: `${year}-08-17`,
      name: "HUT Kemerdekaan RI (Demo UAT)",
      holiday_type: "national",
      description: "Libur nasional — data synthetic untuk UAT lokal.",
    },
    {
      key: `${DEMO_PREFIX}:holiday-company`,
      date: `${year}-12-24`,
      name: "Libur Perusahaan Akhir Tahun (Demo UAT)",
      holiday_type: "company",
      description: "Cuti bersama perusahaan — data synthetic untuk UAT lokal.",
    },
  ];

  for (const h of holidays) {
    if (await findByDemoKey(token, "office_holidays", h.key)) {
      console.log(`  = holiday ${h.name}`);
      continue;
    }
    const created = await pbJson(
      "POST",
      "/api/collections/office_holidays/records",
      {
        date: h.date,
        name: h.name,
        holiday_type: h.holiday_type,
        description: h.description,
        company_id: companyId || "",
        is_active: true,
        is_demo: true,
        demo_seed_key: h.key,
      },
      token,
    );
    if (!created.ok) throw new Error(`holiday ${h.key}: ${JSON.stringify(created.data).slice(0, 300)}`);
    console.log(`  + holiday ${h.name}`);
    await ensureNotification(token, {
      recipient: user.id,
      type: "hr.holiday.created",
      title: "Hari Libur Baru",
      body: `${h.date} — ${h.name}`,
      resource_type: "office_holidays",
      resource_id: created.data.id,
      action: "/dashboard-staff/holidays",
      idempotency_key: `hr.holiday.created:${h.key}:${user.id}`,
    });
  }

  const payslipRes = await pbJson(
    "GET",
    `/api/collections/payroll_items/records?filter=${encodeURIComponent(
      `user = "${pbEscape(user.id)}" && is_demo = true`,
    )}&sort=-created&perPage=1`,
    null,
    token,
  );
  const latestSlip = payslipRes.data.items?.[0];
  if (latestSlip) {
    const nKey = `payslip.available:${latestSlip.id}:${user.id}`;
    const exists = await pbJson(
      "GET",
      `/api/collections/notifications/records?filter=${encodeURIComponent(
        `idempotency_key = "${pbEscape(nKey)}"`,
      )}&perPage=1`,
      null,
      token,
    );
    if (!exists.data.items?.[0]) {
      await ensureNotification(token, {
        recipient: user.id,
        type: "payslip.available",
        title: "Slip Gaji Tersedia",
        body: "Slip gaji demo UAT sudah dapat diakses.",
        resource_type: "payroll_items",
        resource_id: latestSlip.id,
        action: "/dashboard-staff/payroll",
        idempotency_key: nKey,
      });
      console.log("  + payslip notification");
    } else {
      console.log("  = payslip notification");
    }
  }

  console.log("\nStaff UAT seed complete — login as fn2@gmail.com");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
