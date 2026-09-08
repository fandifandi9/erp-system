import {
  fetchPayrollItemsByPeriod,
  PAYROLL_PERIODS_COLLECTION,
  type PayrollItemView,
  type PayrollPeriod,
} from "@/lib/payroll";
import { pb } from "@/lib/pocketbase";
import {
  buildAndDownloadXlsx,
  buildStyledXlsxBuffer,
  sanitizeExportFilename,
  type XlsxColumnDef,
} from "@/lib/export/xlsx";

type PayrollRowKey =
  | "period_key"
  | "period_status"
  | "employee_name"
  | "base_salary"
  | "overtime_amount"
  | "attendance_bonus_eligible"
  | "attendance_bonus_amount"
  | "attendance_bonus_reason"
  | "leave_encashment_days"
  | "leave_encashment_amount"
  | "leave_encashment_reason"
  | "late_deduction"
  | "absence_deduction"
  | "gross_amount"
  | "total_deduction"
  | "net_amount";

const PAYROLL_COLUMNS: XlsxColumnDef<PayrollRowKey>[] = [
  { header: "Periode", key: "period_key", width: 14, type: "text" },
  { header: "Status Periode", key: "period_status", width: 14, type: "text" },
  { header: "Nama Karyawan", key: "employee_name", width: 28, type: "text" },
  { header: "Gaji Pokok", key: "base_salary", width: 16, type: "currency_idr" },
  { header: "Lembur", key: "overtime_amount", width: 14, type: "currency_idr" },
  { header: "Bonus Hadir (Y/T)", key: "attendance_bonus_eligible", width: 12, type: "text" },
  { header: "Nominal Bonus Hadir", key: "attendance_bonus_amount", width: 18, type: "currency_idr" },
  { header: "Alasan Bonus", key: "attendance_bonus_reason", width: 24, type: "text" },
  { header: "Hari Cuti Diuangkan", key: "leave_encashment_days", width: 14, type: "integer" },
  { header: "Nominal Cuti Diuangkan", key: "leave_encashment_amount", width: 18, type: "currency_idr" },
  { header: "Alasan Cuti Diuangkan", key: "leave_encashment_reason", width: 24, type: "text" },
  { header: "Potongan Terlambat", key: "late_deduction", width: 16, type: "currency_idr" },
  { header: "Potongan Absen", key: "absence_deduction", width: 16, type: "currency_idr" },
  { header: "Bruto", key: "gross_amount", width: 16, type: "currency_idr" },
  { header: "Total Potongan", key: "total_deduction", width: 16, type: "currency_idr" },
  { header: "Bersih (Net)", key: "net_amount", width: 16, type: "currency_idr" },
];

function mapPayrollRows(
  period: Pick<PayrollPeriod, "period_key" | "status">,
  items: PayrollItemView[]
): Array<Record<PayrollRowKey, unknown>> {
  return items.map((x) => ({
    period_key: period.period_key,
    period_status: period.status,
    employee_name: x.employee_name,
    base_salary: x.base_salary,
    overtime_amount: x.overtime_amount,
    attendance_bonus_eligible: x.attendance_bonus_eligible ? "Ya" : "Tidak",
    attendance_bonus_amount: x.attendance_bonus_amount,
    attendance_bonus_reason: x.attendance_bonus_reason ?? "",
    leave_encashment_days: x.leave_encashment_days,
    leave_encashment_amount: x.leave_encashment_amount,
    leave_encashment_reason: x.leave_encashment_reason ?? "",
    late_deduction: x.late_deduction,
    absence_deduction: x.absence_deduction,
    gross_amount: x.gross_amount,
    total_deduction: x.total_deduction,
    net_amount: x.net_amount,
  }));
}

async function loadPayrollExportData(periodId: string) {
  const periodRaw = await pb.collection(PAYROLL_PERIODS_COLLECTION).getOne(periodId, {
    requestKey: null,
  });
  const period: Pick<PayrollPeriod, "period_key" | "status"> = {
    period_key: String((periodRaw as { period_key?: string }).period_key ?? periodId),
    status: String((periodRaw as { status?: string }).status ?? "draft") as PayrollPeriod["status"],
  };
  const items = await fetchPayrollItemsByPeriod(periodId);
  return { period, items };
}

export async function buildPayrollXlsxForPeriod(
  periodId: string
): Promise<{ filename: string; buffer: ArrayBuffer }> {
  const { period, items } = await loadPayrollExportData(periodId);
  const filename = sanitizeExportFilename(`payroll-${period.period_key || periodId}.xlsx`);
  const buffer = await buildStyledXlsxBuffer({
    sheetName: "Payroll",
    columns: PAYROLL_COLUMNS,
    rows: mapPayrollRows(period, items),
  });
  return { filename, buffer };
}

export async function downloadPayrollXlsxForPeriod(periodId: string): Promise<void> {
  const { period, items } = await loadPayrollExportData(periodId);
  await buildAndDownloadXlsx({
    sheetName: "Payroll",
    filename: `payroll-${period.period_key || periodId}.xlsx`,
    columns: PAYROLL_COLUMNS,
    rows: mapPayrollRows(period, items),
  });
}
