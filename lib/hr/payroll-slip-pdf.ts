/**
 * Fintech-clean payslip HTML (A4) — sans-serif, alfabet periode, THP hero, rekening lengkap.
 */

import { maskBankAccountNumber } from "@/lib/hr/payroll-bank-account-utils";

export type PayslipPdfInput = {
  id: string;
  period_key: string;
  period_status: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  employee_name: string;
  position?: string;
  department?: string;
  division?: string;
  employee_code?: string;
  base_salary: number;
  fixed_allowance?: number;
  overtime_amount: number;
  attendance_bonus_amount: number;
  attendance_bonus_eligible: boolean;
  attendance_bonus_reason?: string;
  leave_encashment_amount: number;
  leave_encashment_reason?: string;
  leave_quota_credit_amount?: number;
  leave_quota_credit_reason?: string;
  extra_bonus_amount?: number;
  extra_bonus_eligible?: boolean;
  extra_bonus_reason?: string;
  late_deduction: number;
  absence_deduction: number;
  gross_amount: number;
  total_deduction: number;
  net_amount: number;
  company_name: string;
  company_legal_name?: string;
  entity_type?: string;
  company_address?: string;
  company_npwp?: string;
  company_logo_data_url?: string;
  bank_name?: string;
  bank_account_number_snapshot?: string;
  bank_account_holder_snapshot?: string;
};

const PERIOD_STATUS_LABEL: Record<string, string> = {
  approved: "DISETUJUI",
  paid: "DIBAYAR",
  closed: "PERIODE DITUTUP",
};

function money(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateId(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** `2026-08` → `Agustus 2026` */
export function formatPeriodMonthYear(periodKey: string): string {
  const m = String(periodKey || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(dt.getTime())) return periodKey;
  return dt.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function rowHtml(label: string, amount: number, opts?: { muted?: boolean; note?: string }): string {
  const cls = opts?.muted ? "row muted" : "row";
  const note = opts?.note ? `<div class="note">${esc(opts.note)}</div>` : "";
  return `<tr class="${cls}"><td class="lbl">${esc(label)}${note}</td><td class="amt">Rp ${money(amount)}</td></tr>`;
}

function infoRow(label: string, value: string): string {
  return `<tr><td class="info-lbl">${esc(label)}</td><td class="info-val">${esc(value)}</td></tr>`;
}

export function buildPayrollSlipHtml(slip: PayslipPdfInput): string {
  const statusLabel = PERIOD_STATUS_LABEL[slip.period_status] ?? slip.period_status.toUpperCase();
  const periodTitle = formatPeriodMonthYear(slip.period_key);
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const logoHtml = slip.company_logo_data_url
    ? `<img src="${slip.company_logo_data_url}" alt="" class="logo"/>`
    : `<div class="logo-fallback">${esc(slip.company_name.slice(0, 1).toUpperCase())}</div>`;

  const bankMasked = slip.bank_account_number_snapshot
    ? maskBankAccountNumber(slip.bank_account_number_snapshot)
    : "";
  const hasBank = Boolean(slip.bank_name || bankMasked || slip.bank_account_holder_snapshot);

  const bonusNote =
    slip.attendance_bonus_reason && !slip.attendance_bonus_eligible
      ? `Tidak memenuhi syarat. ${slip.attendance_bonus_reason}`
      : slip.attendance_bonus_reason || undefined;

  const allowance = slip.fixed_allowance ?? 0;
  const quota = slip.leave_quota_credit_amount ?? 0;
  const extra = slip.extra_bonus_amount ?? 0;

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>Slip Gaji ${esc(periodTitle)}</title><style>
@page{size:A4;margin:16mm 18mm}
*{box-sizing:border-box}
body{
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#0f172a;font-size:10.5pt;line-height:1.45;margin:0;background:#fff
}
.sheet{max-width:100%;padding:28px 32px 32px}
.top-bar{
  display:flex;justify-content:space-between;align-items:center;
  font-size:8pt;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
  color:#64748b;margin-bottom:18px;padding-bottom:10px;border-bottom:1px solid #e2e8f0
}
.header{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:22px}
.brand{display:flex;align-items:center;gap:16px;flex:1;min-width:0}
.logo{width:76px;height:76px;object-fit:contain;border-radius:14px;border:1px solid #e2e8f0;padding:6px;background:#fff;flex-shrink:0}
.logo-fallback{
  width:76px;height:76px;display:flex;align-items:center;justify-content:center;flex-shrink:0;
  border-radius:14px;background:#0f172a;color:#fff;font-size:22pt;font-weight:700
}
.company{font-size:14pt;font-weight:700;color:#0f172a;line-height:1.3;letter-spacing:-.01em}
.legal{font-size:8.5pt;color:#64748b;margin-top:3px}
.addr{font-size:8pt;color:#94a3b8;margin-top:4px;max-width:320px}
.doc-meta{text-align:right;min-width:190px;flex-shrink:0}
.doc-meta .kicker{font-size:8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin:0}
.doc-meta h1{margin:4px 0 0;font-size:18pt;font-weight:800;letter-spacing:-.02em;color:#0f172a}
.doc-meta .period{margin:6px 0 0;font-size:11pt;font-weight:600;color:#334155}
.status{
  display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;
  background:#ecfdf5;color:#047857;font-size:8pt;font-weight:700;letter-spacing:.04em
}
.hero{
  display:flex;justify-content:space-between;align-items:center;gap:16px;
  padding:18px 22px;margin-bottom:22px;border-radius:14px;
  background:#0f172a;color:#fff
}
.hero .lbl{font-size:8.5pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin:0}
.hero .val{margin:4px 0 0;font-size:20pt;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.hero .sub{font-size:8.5pt;color:#94a3b8;text-align:right;max-width:200px}
.section{margin-bottom:14px}
.section h2{
  font-size:8.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
  color:#64748b;margin:0 0 10px
}
.panel{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;background:#f8fafc}
.info-table{width:100%;border-collapse:collapse}
.info-lbl{width:36%;padding:5px 10px 5px 0;color:#64748b;font-size:9pt;vertical-align:top}
.info-val{padding:5px 0;font-weight:600;font-size:9.5pt;vertical-align:top;color:#0f172a}
.amount-table{width:100%;border-collapse:collapse}
.row td{padding:7px 0;vertical-align:top;border-bottom:1px solid #e2e8f0}
.row:last-child td{border-bottom:none}
.row .lbl{color:#334155;width:62%;font-size:9.5pt}
.row .amt{text-align:right;font-weight:600;white-space:nowrap;font-size:9.5pt;font-variant-numeric:tabular-nums;color:#0f172a}
.row.muted .lbl,.row.muted .amt{color:#64748b}
.note{font-size:8pt;color:#94a3b8;margin-top:2px}
.subtotal td{padding-top:10px;border-top:1px solid #cbd5e1;border-bottom:none;font-weight:700}
.earn-panel{border-color:#bbf7d0;background:#f0fdf4}
.deduct-panel{border-color:#fecaca;background:#fff1f2}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.footer{margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:7.5pt;color:#94a3b8;text-align:center}
.footer .tech{margin-top:4px;color:#cbd5e1}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{padding:0}}
</style></head><body><div class="sheet">
<div class="top-bar"><span>CONFIDENTIAL / RAHASIA</span><span>SERBA ERP</span></div>

<header class="header">
  <div class="brand">${logoHtml}
    <div>
      <div class="company">${esc(slip.company_legal_name || slip.company_name)}</div>
      ${slip.company_legal_name && slip.company_legal_name !== slip.company_name ? `<div class="legal">${esc(slip.company_name)}</div>` : ""}
      ${slip.entity_type ? `<div class="legal">Entitas administratif · ${esc(slip.entity_type)}</div>` : ""}
      ${slip.company_address ? `<div class="addr">${esc(slip.company_address)}</div>` : ""}
      ${slip.company_npwp ? `<div class="addr">NPWP ${esc(slip.company_npwp)}</div>` : ""}
    </div>
  </div>
  <div class="doc-meta">
    <p class="kicker">Slip Gaji</p>
    <h1>${esc(periodTitle)}</h1>
    <p class="period">${esc(formatDateId(slip.period_start))} – ${esc(formatDateId(slip.period_end))}</p>
    <span class="status">STATUS: ${esc(statusLabel)}</span>
  </div>
</header>

<section class="hero">
  <div>
    <p class="lbl">Take Home Pay</p>
    <p class="val">Rp ${money(slip.net_amount)}</p>
  </div>
  <div class="sub">Jumlah bersih yang ditransfer ke rekening Anda untuk periode ini.</div>
</section>

<div class="two-col">
<section class="section">
  <h2>Informasi Karyawan</h2>
  <div class="panel">
  <table class="info-table">
${infoRow("Nama", slip.employee_name)}
${slip.employee_code ? infoRow("NIK / Kode", slip.employee_code) : ""}
${slip.position ? infoRow("Jabatan", slip.position) : ""}
${slip.department ? infoRow("Departemen", slip.department) : ""}
${slip.division ? infoRow("Divisi", slip.division) : ""}
  </table>
  </div>
</section>

<section class="section">
  <h2>Informasi Pembayaran</h2>
  <div class="panel">
  <table class="info-table">
${hasBank ? infoRow("Bank", slip.bank_name || "—") : infoRow("Bank", "Belum tercatat")}
${hasBank ? infoRow("No. Rekening", bankMasked || "—") : ""}
${hasBank ? infoRow("Nama Rekening", slip.bank_account_holder_snapshot || "—") : ""}
${infoRow("Metode", "Transfer gaji")}
${infoRow("Tanggal Bayar", slip.pay_date ? formatDateId(slip.pay_date) : "—")}
  </table>
  </div>
</section>
</div>

<div class="two-col" style="margin-top:4px">
<section class="section"><h2>Pendapatan</h2>
<div class="panel earn-panel"><table class="amount-table">
${rowHtml("Gaji Pokok", slip.base_salary)}
${allowance > 0 ? rowHtml("Tunjangan", allowance) : ""}
${rowHtml("Lembur", slip.overtime_amount)}
${rowHtml("Bonus Kehadiran", slip.attendance_bonus_amount, { note: bonusNote })}
${rowHtml("Pencairan Cuti", slip.leave_encashment_amount, { note: slip.leave_encashment_reason })}
${quota > 0 ? rowHtml("Kredit Kuota Cuti", quota, { note: slip.leave_quota_credit_reason }) : ""}
${extra > 0 ? rowHtml("Bonus Extra", extra, { note: slip.extra_bonus_reason }) : ""}
<tr class="subtotal"><td class="lbl">Jumlah Kotor</td><td class="amt">Rp ${money(slip.gross_amount)}</td></tr>
</table></div></section>

<section class="section"><h2>Potongan</h2>
<div class="panel deduct-panel"><table class="amount-table">
${rowHtml("Potongan Terlambat", slip.late_deduction, { muted: true })}
${rowHtml("Potongan Absensi", slip.absence_deduction, { muted: true })}
<tr class="subtotal"><td class="lbl">Total Potongan</td><td class="amt">Rp ${money(slip.total_deduction)}</td></tr>
</table></div></section>
</div>

<footer class="footer">
  Dokumen elektronik SERBA ERP · ${esc(generatedAt)} · Rahasia — hanya untuk penerima yang berwenang.
  <div class="tech">Ref. periode ${esc(slip.period_key)}</div>
</footer>
</div></body></html>`;
}
