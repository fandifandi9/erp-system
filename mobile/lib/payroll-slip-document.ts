import { Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { StaffPayrollSlip } from "@/lib/payroll";

export type PayrollSlipEmployeeMeta = {
  name: string;
  email?: string;
  position?: string;
  department?: string;
  division?: string;
};

const PERIOD_STATUS_LABEL: Record<string, string> = {
  approved: "Disetujui",
  paid: "Dibayar",
  closed: "Periode ditutup",
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

function rowHtml(label: string, amount: number, opts?: { muted?: boolean; note?: string }): string {
  const cls = opts?.muted ? "row muted" : "row";
  const note = opts?.note ? `<div class="note">${esc(opts.note)}</div>` : "";
  return `<tr class="${cls}"><td class="lbl">${esc(label)}${note}</td><td class="amt">Rp ${money(amount)}</td></tr>`;
}

function metaItem(label: string, value: string): string {
  return (
    '<motion class="meta-item"><label>' +
    esc(label) +
    "</label><span>" +
    esc(value) +
    "</span></motion>"
  ).replace(/motion/g, "div");
}

export function buildSerbaPayrollSlipHtml(
  slip: StaffPayrollSlip,
  employee: PayrollSlipEmployeeMeta
): string {
  const statusLabel = PERIOD_STATUS_LABEL[slip.period_status] ?? slip.period_status;
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const bonusNote =
    slip.attendance_bonus_reason && !slip.attendance_bonus_eligible
      ? `Tidak memenuhi syarat. ${slip.attendance_bonus_reason}`
      : slip.attendance_bonus_reason || undefined;

  const meta: string[] = [
    metaItem("Nama karyawan", employee.name || slip.employee_name),
    metaItem(
      "Periode gaji",
      `${formatDateId(slip.period_start)} – ${formatDateId(slip.period_end)}`
    ),
  ];
  if (employee.position) meta.push(metaItem("Jabatan", employee.position));
  if (employee.division) meta.push(metaItem("Divisi", employee.division));
  if (employee.department) meta.push(metaItem("Departemen", employee.department));
  if (employee.email) meta.push(metaItem("Email", employee.email));
  meta.push(metaItem("Tanggal pembayaran", slip.pay_date ? formatDateId(slip.pay_date) : "—"));

  const parts = [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><style>',
    "@page{margin:18mm 16mm}*{box-sizing:border-box}",
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;font-size:11pt;line-height:1.45;margin:0}",
    ".sheet{max-width:720px;margin:0 auto}",
    ".brand{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #4f46e5;padding-bottom:14px;margin-bottom:20px}",
    ".brand-left{display:flex;align-items:center;gap:14px}",
    ".logo{width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}",
    ".company{font-size:22pt;font-weight:800;color:#4f46e5;letter-spacing:2px}",
    ".tagline{font-size:9pt;color:#64748b;margin-top:2px}",
    ".doc-title{text-align:right}.doc-title h1{margin:0;font-size:16pt;font-weight:800}",
    ".doc-title p{margin:4px 0 0;font-size:9pt;color:#64748b}",
    ".meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-bottom:22px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}",
    ".meta-item label{display:block;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin-bottom:3px}",
    ".meta-item span{font-size:10.5pt;font-weight:600}",
    ".section{margin-bottom:18px}",
    ".section h2{font-size:10pt;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#4f46e5;margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}",
    "table{width:100%;border-collapse:collapse}",
    ".row td{padding:7px 0;vertical-align:top}.row .lbl{color:#334155;width:58%}",
    ".row .amt{text-align:right;font-weight:600;white-space:nowrap}",
    ".row.muted .lbl,.row.muted .amt{color:#64748b}",
    ".note{font-size:8.5pt;color:#94a3b8;margin-top:2px}",
    ".subtotal td{padding-top:10px;border-top:1px dashed #cbd5e1;font-weight:700}",
    ".thp{margin-top:16px;padding:14px 16px;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:2px solid #059669;border-radius:10px;display:flex;justify-content:space-between;align-items:center}",
    ".thp .lbl{font-size:12pt;font-weight:800;color:#065f46}",
    ".thp .val{font-size:16pt;font-weight:800;color:#047857}",
    ".footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:8.5pt;color:#94a3b8;text-align:center}",
    ".status-pill{display:inline-block;padding:3px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:9pt;font-weight:700}",
    '</style></head><body><div class="sheet">',
    '<header class="brand"><div class="brand-left">',
    '<div class="logo">SERBA</div><div><motion class="company">SERBA</div><div class="tagline">Sistem Informasi Kepegawaian</div></div></div>',
    `<div class="doc-title"><h1>SLIP GAJI</h1><p>Periode ${esc(slip.period_key)}</p>`,
    `<p><span class="status-pill">${esc(statusLabel)}</span></p></div></header>`,
    `<div class="meta-grid">${meta.join("")}</div>`,
    '<section class="section"><h2>Pendapatan</h2><table>',
    rowHtml("Gaji pokok", slip.base_salary),
    rowHtml("Lembur", slip.overtime_amount),
    rowHtml("Bonus kehadiran", slip.attendance_bonus_amount, { note: bonusNote }),
    rowHtml("Pencairan cuti", slip.leave_encashment_amount, {
      note: slip.leave_encashment_reason || undefined,
    }),
    `<tr class="subtotal"><td class="lbl">Jumlah kotor</td><td class="amt">Rp ${money(slip.gross_amount)}</td></tr>`,
    "</table></section>",
    '<section class="section"><h2>Potongan</h2><table>',
    rowHtml("Potongan terlambat", slip.late_deduction, { muted: true }),
    rowHtml("Potongan absensi", slip.absence_deduction, { muted: true }),
    `<tr class="subtotal"><td class="lbl">Total potongan</td><td class="amt">Rp ${money(slip.total_deduction)}</td></tr>`,
    "</table></section>",
    `<motion class="thp"><span class="lbl">Take Home Pay (THP)</span><span class="val">Rp ${money(slip.net_amount)}</span></div>`,
    `<footer class="footer">Dokumen ini diterbitkan secara elektronik oleh SERBA System · ${esc(generatedAt)}<br/>`,
    "Slip ini sah tanpa tanda tangan basah apabila status periode telah disetujui/dibayar oleh HR.</footer>",
    "</div></body></html>",
  ];

  return parts.join("").replace(/motion/g, "div");
}

export async function downloadSerbaPayrollSlipPdf(
  slip: StaffPayrollSlip,
  employee: PayrollSlipEmployeeMeta
): Promise<void> {
  const html = buildSerbaPayrollSlipHtml(slip, employee);

  try {
    const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Unduh slip gaji ${slip.period_key}`,
        UTI: Platform.OS === "ios" ? `SERBA-Slip-Gaji-${slip.period_key}.pdf` : undefined,
      });
      return;
    }

    Alert.alert("PDF dibuat", `File tersimpan di:\n${uri}`);
  } catch (e) {
    Alert.alert("Gagal mengunduh", e instanceof Error ? e.message : "Gagal membuat PDF slip gaji.");
    throw e;
  }
}
