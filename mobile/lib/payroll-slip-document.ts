import { Platform, Alert } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { StaffPayrollSlip } from "@/lib/payroll";
import {
  buildPayrollSlipHtml,
  formatPeriodMonthYear,
  type PayslipPdfInput,
} from "@/lib/hr/payroll-slip-pdf";

export type PayrollSlipEmployeeMeta = {
  name: string;
  email?: string;
  position?: string;
  department?: string;
  division?: string;
};

export { formatPeriodMonthYear };

function toPayslipInput(
  slip: StaffPayrollSlip,
  employee: PayrollSlipEmployeeMeta
): PayslipPdfInput {
  return {
    id: slip.id,
    period_key: slip.period_key,
    period_status: slip.period_status,
    period_start: slip.period_start,
    period_end: slip.period_end,
    pay_date: slip.pay_date,
    employee_name: employee.name || slip.employee_name,
    position: employee.position,
    department: employee.department,
    division: employee.division,
    base_salary: slip.base_salary,
    overtime_amount: slip.overtime_amount,
    attendance_bonus_amount: slip.attendance_bonus_amount,
    attendance_bonus_eligible: slip.attendance_bonus_eligible,
    attendance_bonus_reason: slip.attendance_bonus_reason,
    leave_encashment_amount: slip.leave_encashment_amount,
    leave_encashment_reason: slip.leave_encashment_reason,
    leave_quota_credit_amount: slip.leave_quota_credit_amount,
    leave_quota_credit_reason: slip.leave_quota_credit_reason,
    extra_bonus_amount: slip.extra_bonus_amount,
    extra_bonus_eligible: slip.extra_bonus_eligible,
    extra_bonus_reason: slip.extra_bonus_reason,
    late_deduction: slip.late_deduction,
    absence_deduction: slip.absence_deduction,
    gross_amount: slip.gross_amount,
    total_deduction: slip.total_deduction,
    net_amount: slip.net_amount,
    company_name: "SERBA",
  };
}

/** Fintech-clean slip (sama template web/PDF A). */
export function buildSerbaPayrollSlipHtml(
  slip: StaffPayrollSlip,
  employee: PayrollSlipEmployeeMeta
): string {
  return buildPayrollSlipHtml(toPayslipInput(slip, employee));
}

export async function downloadSerbaPayrollSlipPdf(
  slip: StaffPayrollSlip,
  employee: PayrollSlipEmployeeMeta
): Promise<void> {
  const html = buildSerbaPayrollSlipHtml(slip, employee);
  const periodLabel = formatPeriodMonthYear(slip.period_key);

  try {
    const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Unduh slip gaji ${periodLabel}`,
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
