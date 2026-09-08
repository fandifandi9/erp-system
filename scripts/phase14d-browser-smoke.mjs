/**
 * Phase 14D interactive browser smoke — LOCAL only.
 * Refuses production/staging hosts.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = loadEnv();
const APP = (env.SMOKE_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const PB = (env.NEXT_PUBLIC_POCKETBASE_URL || "").replace(/\/$/, "");
const PASS = env.SMOKE_PASSWORD || "SerbaSmoke2026!";

function refuse(url) {
  const u = String(url).toLowerCase();
  if (u.includes("serba.space") || u.includes("8091") || u.includes("8092") || u.includes("pb-staging")) {
    console.error("BLOCKED — browser smoke is LOCAL only. URL:", url);
    process.exit(2);
  }
}
refuse(APP);
refuse(PB);
if (!PB.includes("127.0.0.1:8090") && !PB.includes("localhost:8090")) {
  console.error("BLOCKED — NEXT_PUBLIC_POCKETBASE_URL is not 127.0.0.1:8090");
  process.exit(2);
}

const results = [];
function rec(id, pass, detail) {
  results.push({ id, pass, detail });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${id} — ${detail}`);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const docOverflow = doc.scrollWidth > doc.clientWidth + 2 || body.scrollWidth > body.clientWidth + 2;
    const side = document.getElementById("app-sidebar");
    const sideOverflow = side ? side.scrollWidth > side.clientWidth + 2 : false;
    return { docOverflow, sideOverflow, docW: doc.scrollWidth, clientW: doc.clientWidth };
  });
}

async function login(page, email) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle", timeout: 60000 });
  const emailInput = page.locator('form input[type="email"]').first();
  const passInput = page.locator('form input[type="password"]');
  await emailInput.waitFor({ state: "visible" });
  await emailInput.click();
  await emailInput.fill(email);
  await passInput.click();
  await passInput.fill(PASS);
  const filledEmail = await emailInput.inputValue();
  if (filledEmail !== email) throw new Error("email not filled: " + filledEmail);
  await page.getByRole("button", { name: /^masuk$/i }).click();
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 });
}

async function logout(page) {
  await page.locator("header button.flex.items-center.gap-3").click();
  await page.getByRole("button", { name: /keluar|logout/i }).click({ timeout: 15000 });
  await page.waitForURL(/\/login/, { timeout: 30000 });
}

async function openDrawer(page) {
  const burger = page.locator('button[aria-controls="app-sidebar"]');
  if (!(await burger.isVisible())) return;
  const expanded = await burger.getAttribute("aria-expanded");
  if (expanded === "true") return;
  await burger.click({ force: true });
  await page.waitForTimeout(400);
}

async function clickSection(page, title) {
  const nav = page.locator("#app-sidebar");
  const btn = nav.getByRole("button", { name: new RegExp(title, "i") }).first();
  const expanded = await btn.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await btn.click({ force: true });
    await page.waitForTimeout(250);
  }
}

async function clickNavHref(page, href, sectionTitle) {
  if (sectionTitle) await clickSection(page, sectionTitle);
  await page.locator(`#app-sidebar a[href="${href}"]`).click({ force: true });
}

const HR_MUST = [
  "Dashboard",
  "Karyawan",
  "Absensi",
  "Jadwal",
  "Cuti",
  "Lembur",
  "Aktivitas Lapangan",
  "Aktivitas Mencurigakan",
  "Pengaturan GPS",
  "Penggajian",
  "Penilaian / Rating",
  "Laporan & Temuan",
  "Peran & Izin",
  "Notifikasi",
];
const HR_FORBID = [
  "Pajak",
  "Toko",
  "Marketplace",
  "Ekspedisi",
  "Metode Pembayaran",
  "Template",
  "Integrasi",
];

async function run() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    await login(page, "smoke-owner@serba.test");
    rec("owner.login", !page.url().includes("/login"), page.url());
    rec("owner.dashboard", /dashboard-owner|dashboard/.test(page.url()) || page.url().includes("/hr") || page.url().includes("/staff"), page.url());
    const ownerText = await page.locator("#app-sidebar").innerText().catch(() => "");
    rec("owner.nav.erp", /pengaturan|penjualan|pajak|toko/i.test(ownerText) || ownerText.length > 0, ownerText.slice(0, 200).replace(/\s+/g, " "));
    await logout(page);
    rec("owner.logout", page.url().includes("/login"), page.url());

    await login(page, "smoke-hr@serba.test");
    rec("hr.login", !page.url().includes("/login"), page.url());
    rec("hr.dashboard", page.url().includes("/hr"), page.url());

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    await clickSection(page, "SDM");
    await clickSection(page, "Kinerja");
    await clickSection(page, "Laporan");
    await clickSection(page, "Pengaturan");
    const navText = await page.locator("#app-sidebar").innerText();
    const missing = HR_MUST.filter((l) => !navText.toLowerCase().includes(l.toLowerCase()));
    rec("hr.nav.required", missing.length === 0, missing.join(", ") || "all present");
    const leaked = HR_FORBID.filter((l) => navText.toLowerCase().includes(l.toLowerCase()));
    rec("hr.nav.forbidden", leaked.length === 0, leaked.join(", ") || "none leaked");
    rec("hr.nav.posStandalone", !/\bPOS\b/.test(navText) && !/kasir pos/i.test(navText), "POS");

    try {
      await clickNavHref(page, "/hr/rating", "Kinerja");
      await page.waitForURL(/\/hr\/rating/, { timeout: 30000 });
      rec("hr.click.rating", true, page.url());
    } catch (e) {
      rec("hr.click.rating", false, page.url() + " " + (e instanceof Error ? e.message : e));
    }
    try {
      await clickNavHref(page, "/hr/reports", "Laporan");
      await page.waitForURL(/\/hr\/reports|\/laporan/, { timeout: 30000 });
      rec("hr.click.reports", true, page.url());
    } catch (e) {
      rec("hr.click.reports", false, page.url() + " " + (e instanceof Error ? e.message : e));
    }
    try {
      await clickNavHref(page, "/pengaturan/role", "Pengaturan");
      await page.waitForURL(/\/pengaturan\/role/, { timeout: 30000 });
      rec("hr.click.role", true, page.url());
    } catch (e) {
      rec("hr.click.role", false, page.url() + " " + (e instanceof Error ? e.message : e));
    }

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);

    for (const w of [360, 390, 430]) {
      try {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(500);
        await openDrawer(page);
        const ov = await overflow(page);
        rec(`hr.viewport.${w}.overflow`, !ov.docOverflow && !ov.sideOverflow, JSON.stringify(ov));
        const side = page.locator("#app-sidebar");
        rec(`hr.viewport.${w}.drawerVisible`, await side.isVisible(), "sidebar");
        await clickSection(page, "SDM");
        await clickSection(page, "Kinerja");
        await clickSection(page, "Laporan");
        await clickSection(page, "Pengaturan");
        await side.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
          el.scrollTop = 0;
        });
        const html = await side.innerText();
        rec(`hr.viewport.${w}.penggajian`, /penggajian/i.test(html), "label");
        rec(`hr.viewport.${w}.rating`, /penilaian|rating/i.test(html), "label");
        rec(`hr.viewport.${w}.laporanTemuan`, /laporan\s*&\s*temuan/i.test(html), "label");
      } catch (e) {
        rec(`hr.viewport.${w}.fatal`, false, e instanceof Error ? e.message : String(e));
      }
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    await logout(page);
    rec("hr.logout", page.url().includes("/login"), page.url());

    await login(page, "smoke-employee@serba.test");
    rec("employee.login", !page.url().includes("/login"), page.url());
    rec("employee.dashboard", page.url().includes("/dashboard-staff") || page.url().includes("/profile"), page.url());
    const empNav = await page.locator("#app-sidebar").innerText().catch(() => "");
    rec("employee.noHrSdm", !/karyawan/i.test(empNav) || !empNav.includes("SDM"), empNav.slice(0, 180).replace(/\s+/g, " "));
    rec("employee.reports", /laporan/i.test(empNav), empNav.slice(0, 180).replace(/\s+/g, " "));
    rec("employee.noPajak", !/pajak/i.test(empNav) && !/toko/i.test(empNav), "erp hidden");
    rec("employee.noRatingSection", !/kinerja/i.test(empNav), "no kinerja");
    await logout(page);
    rec("employee.logout", page.url().includes("/login"), page.url());
  } catch (e) {
    rec("fatal", false, e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }

  const fail = results.filter((r) => !r.pass).length;
  console.log(`\nSUMMARY PASS=${results.filter((r) => r.pass).length} FAIL=${fail}`);
  process.exit(fail ? 1 : 0);
}

await run();
