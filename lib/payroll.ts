import { pb } from "./pocketbase";

export const PAYROLL_SETTINGS_COLLECTION = "payroll_settings";
export const PAYROLL_PERIODS_COLLECTION = "payroll_periods";
export const PAYROLL_ITEMS_COLLECTION = "payroll_items";
export const PAYROLL_ADJUSTMENTS_COLLECTION = "payroll_adjustments";
export const LEAVE_BALANCES_COLLECTION = "leave_balances";

type SettingRecord = Record<string, unknown>;
type PeriodRecord = Record<string, unknown>;
type AnyRecord = Record<string, unknown>;

export interface PayrollSetting {
  id: string;
  name: string;
  attendance_bonus_enabled: boolean;
  attendance_bonus_amount: number;
  approved_leave_counts_as_presence: boolean;
  approved_field_activity_counts_as_presence: boolean;
  max_unexcused_absence: number;
  late_policy_enabled: boolean;
  max_late_days: number | null;
  max_late_minutes_total: number | null;
  leave_encashment_enabled: boolean;
  leave_encashment_rate: number;
  max_encashable_days_per_cycle: number;
}

export interface PayrollPeriod {
  id: string;
  name: string;
  period_key: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  status: "draft" | "reviewed" | "approved" | "paid" | "closed";
  settings?: string;
}

export interface PayrollItemView {
  id: string;
  user: string;
  profile?: string;
  employee_name: string;
  base_salary: number;
  overtime_amount: number;
  attendance_bonus_amount: number;
  attendance_bonus_eligible: boolean;
  attendance_bonus_reason?: string;
  leave_encashment_amount: number;
  leave_encashment_days: number;
  leave_encashment_reason?: string;
  late_deduction: number;
  absence_deduction: number;
  gross_amount: number;
  total_deduction: number;
  net_amount: number;
  status: string;
}

/** Slip staff: item + ringkasan periode */
export interface StaffPayrollSlip extends PayrollItemView {
  period_key: string;
  period_status: string;
  period_start: string;
  period_end: string;
  pay_date: string;
}

/** Periode sudah final — tidak boleh generate ulang item. */
export function isPayrollPeriodLockedForRegenerate(status: string): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "approved" || s === "paid" || s === "closed";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function overlapDays(startA: string, endA: string, startB: string, endB: string): number {
  const s = new Date(Math.max(new Date(startA).getTime(), new Date(startB).getTime()));
  const e = new Date(Math.min(new Date(endA).getTime(), new Date(endB).getTime()));
  if (e.getTime() < s.getTime()) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((e.getTime() - s.getTime()) / dayMs) + 1;
}

function countWeekdaysInRange(startDate: string, endDate: string): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0) count += 1;
  }
  return count;
}

function mapSetting(raw: SettingRecord): PayrollSetting {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Default Payroll"),
    attendance_bonus_enabled: toBool(raw.attendance_bonus_enabled, true),
    attendance_bonus_amount: toNumber(raw.attendance_bonus_amount, 0),
    approved_leave_counts_as_presence: toBool(raw.approved_leave_counts_as_presence, true),
    approved_field_activity_counts_as_presence: toBool(raw.approved_field_activity_counts_as_presence, true),
    max_unexcused_absence: Math.max(0, Math.floor(toNumber(raw.max_unexcused_absence, 0))),
    late_policy_enabled: toBool(raw.late_policy_enabled, false),
    max_late_days: raw.max_late_days == null ? null : Math.max(0, Math.floor(toNumber(raw.max_late_days, 0))),
    max_late_minutes_total:
      raw.max_late_minutes_total == null ? null : Math.max(0, Math.floor(toNumber(raw.max_late_minutes_total, 0))),
    leave_encashment_enabled: toBool(raw.leave_encashment_enabled, false),
    leave_encashment_rate: Math.max(0, toNumber(raw.leave_encashment_rate, 0)),
    max_encashable_days_per_cycle: Math.max(0, Math.floor(toNumber(raw.max_encashable_days_per_cycle, 0))),
  };
}

function mapPeriod(raw: PeriodRecord): PayrollPeriod {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    period_key: String(raw.period_key ?? ""),
    start_date: String(raw.start_date ?? "").slice(0, 10),
    end_date: String(raw.end_date ?? "").slice(0, 10),
    pay_date: String(raw.pay_date ?? "").slice(0, 10),
    status: String(raw.status ?? "draft") as PayrollPeriod["status"],
    settings: String(raw.settings ?? "") || undefined,
  };
}

export async function fetchActivePayrollSetting(): Promise<PayrollSetting | null> {
  try {
    const active = await pb.collection(PAYROLL_SETTINGS_COLLECTION).getFirstListItem("is_active=true", {
      requestKey: null,
    });
    return mapSetting(active as unknown as SettingRecord);
  } catch {
    try {
      const list = await pb.collection(PAYROLL_SETTINGS_COLLECTION).getList(1, 1, {
        sort: "-updated",
        requestKey: null,
      });
      const row = list.items[0];
      return row ? mapSetting(row as unknown as SettingRecord) : null;
    } catch {
      return null;
    }
  }
}

export async function fetchPayrollPeriods(): Promise<PayrollPeriod[]> {
  const list = await pb.collection(PAYROLL_PERIODS_COLLECTION).getFullList({
    sort: "-start_date",
    requestKey: null,
  });
  return list.map((r) => mapPeriod(r as unknown as PeriodRecord));
}

export async function createPayrollPeriod(input: {
  period_key: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  settings: string;
  name?: string;
}): Promise<{ success: boolean; message: string; period?: PayrollPeriod }> {
  const key = input.period_key.trim();
  if (!key) return { success: false, message: "Period key wajib diisi." };
  try {
    const rec = await pb.collection(PAYROLL_PERIODS_COLLECTION).create({
      name: input.name?.trim() || `Payroll ${key}`,
      period_key: key,
      start_date: input.start_date,
      end_date: input.end_date,
      pay_date: input.pay_date,
      status: "draft",
      settings: input.settings,
    });
    return { success: true, message: "Periode payroll dibuat.", period: mapPeriod(rec as unknown as PeriodRecord) };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "Gagal membuat periode payroll." };
  }
}

async function getApprovedLeaveDays(userId: string, startDate: string, endDate: string): Promise<number> {
  try {
    const rows = await pb.collection("leave_requests").getFullList({
      filter: `user="${userId}" && status="approved"`,
      requestKey: null,
    });
    let days = 0;
    for (const row of rows) {
      const rec = row as AnyRecord;
      const s = String(rec.start_date ?? "").slice(0, 10);
      const e = String(rec.end_date ?? s).slice(0, 10);
      if (!s || !e) continue;
      days += overlapDays(s, e, startDate, endDate);
    }
    return days;
  } catch {
    return 0;
  }
}

async function getApprovedFieldActivityDays(userId: string, startDate: string, endDate: string): Promise<number> {
  try {
    const rows = await pb.collection("field_activity_requests").getFullList({
      filter: `user="${userId}" && status="approved"`,
      requestKey: null,
    });
    let days = 0;
    for (const row of rows) {
      const rec = row as AnyRecord;
      const s = String(rec.start_date ?? "").slice(0, 10);
      const e = String(rec.end_date ?? s).slice(0, 10);
      if (!s || !e) continue;
      days += overlapDays(s, e, startDate, endDate);
    }
    return days;
  } catch {
    return 0;
  }
}

async function getAttendanceStats(userId: string, startDate: string, endDate: string): Promise<{
  presentDays: number;
  lateDays: number;
  lateMinutes: number;
}> {
  try {
    const rows = await pb.collection("attendance_logs").getFullList({
      filter: `user="${userId}" && date >= "${startDate}" && date <= "${endDate}"`,
      requestKey: null,
    });
    let presentDays = 0;
    let lateDays = 0;
    let lateMinutes = 0;
    for (const row of rows) {
      const rec = row as AnyRecord;
      const st = String(rec.status ?? "");
      if (st === "present" || st === "late") presentDays += 1;
      if (st === "late") lateDays += 1;
      lateMinutes += Math.max(0, Math.floor(toNumber(rec.late_minutes, 0)));
    }
    return { presentDays, lateDays, lateMinutes };
  } catch {
    return { presentDays: 0, lateDays: 0, lateMinutes: 0 };
  }
}

async function getOvertimeAmount(userId: string, startDate: string, endDate: string, hourlyRate: number): Promise<number> {
  try {
    const rows = await pb.collection("overtime_requests").getFullList({
      filter: `user="${userId}" && status="hr_approved" && work_date >= "${startDate}" && work_date <= "${endDate}"`,
      requestKey: null,
    });
    const hours = rows.reduce((acc, row) => acc + Math.max(0, toNumber((row as AnyRecord).hours, 0)), 0);
    return Math.round(hours * hourlyRate * 1.5);
  } catch {
    return 0;
  }
}

async function getLeaveEncashment(userId: string, endDate: string, setting: PayrollSetting): Promise<{
  days: number;
  rate: number;
  amount: number;
}> {
  if (!setting.leave_encashment_enabled || setting.leave_encashment_rate <= 0) {
    return { days: 0, rate: setting.leave_encashment_rate, amount: 0 };
  }
  try {
    const year = Number(endDate.slice(0, 4));
    const row = await pb.collection(LEAVE_BALANCES_COLLECTION).getFirstListItem(
      `user="${userId}" && year=${year}`,
      { requestKey: null }
    );
    const remaining = Math.max(0, Math.floor(toNumber((row as AnyRecord).remaining_days, 0)));
    const maxDays = setting.max_encashable_days_per_cycle > 0 ? setting.max_encashable_days_per_cycle : remaining;
    const days = Math.min(remaining, maxDays);
    return {
      days,
      rate: setting.leave_encashment_rate,
      amount: Math.round(days * setting.leave_encashment_rate),
    };
  } catch {
    return { days: 0, rate: setting.leave_encashment_rate, amount: 0 };
  }
}

function attendanceBonusEligible(input: {
  setting: PayrollSetting;
  requiredDays: number;
  presentDays: number;
  approvedLeaveDays: number;
  approvedFieldActivityDays: number;
  lateDays: number;
  lateMinutes: number;
}): { eligible: boolean; reason: string; amount: number; unexcusedAbsence: number } {
  const { setting } = input;
  if (!setting.attendance_bonus_enabled || setting.attendance_bonus_amount <= 0) {
    return { eligible: false, reason: "Bonus kerajinan nonaktif", amount: 0, unexcusedAbsence: 0 };
  }

  const eligiblePresence =
    input.presentDays +
    (setting.approved_leave_counts_as_presence ? input.approvedLeaveDays : 0) +
    (setting.approved_field_activity_counts_as_presence ? input.approvedFieldActivityDays : 0);

  const unexcusedAbsence = Math.max(0, input.requiredDays - eligiblePresence);
  if (unexcusedAbsence > setting.max_unexcused_absence) {
    return {
      eligible: false,
      reason: `Bonus hangus: alpha/tidak sah ${unexcusedAbsence} hari (maks ${setting.max_unexcused_absence})`,
      amount: 0,
      unexcusedAbsence,
    };
  }

  if (setting.late_policy_enabled) {
    if (setting.max_late_days != null && input.lateDays > setting.max_late_days) {
      return {
        eligible: false,
        reason: `Bonus hangus: telat ${input.lateDays} hari (maks ${setting.max_late_days})`,
        amount: 0,
        unexcusedAbsence,
      };
    }
    if (setting.max_late_minutes_total != null && input.lateMinutes > setting.max_late_minutes_total) {
      return {
        eligible: false,
        reason: `Bonus hangus: telat ${input.lateMinutes} menit (maks ${setting.max_late_minutes_total})`,
        amount: 0,
        unexcusedAbsence,
      };
    }
  }

  return {
    eligible: true,
    reason: "Lolos syarat bonus kerajinan",
    amount: setting.attendance_bonus_amount,
    unexcusedAbsence,
  };
}

export async function generatePayrollItems(periodId: string): Promise<{ success: boolean; message: string }> {
  try {
    const rawPeriod = (await pb.collection(PAYROLL_PERIODS_COLLECTION).getOne(periodId, {
      requestKey: null,
      expand: "settings",
    })) as unknown as AnyRecord;
    const period = mapPeriod(rawPeriod);
    if (isPayrollPeriodLockedForRegenerate(period.status)) {
      return {
        success: false,
        message:
          "Periode sudah disetujui/dibayar/ditutup — generate ulang dinonaktifkan. Buat periode baru atau ubah status di PocketBase jika memang perlu koreksi.",
      };
    }
    if (!period.start_date || !period.end_date) {
      return { success: false, message: "Periode payroll tidak valid." };
    }
    const settingRaw = (rawPeriod.expand as AnyRecord | undefined)?.settings as SettingRecord | undefined;
    const setting = settingRaw ? mapSetting(settingRaw) : await fetchActivePayrollSetting();
    if (!setting) return { success: false, message: "Payroll setting belum tersedia." };

    const profiles = await pb.collection("profiles").getFullList({
      sort: "name",
      expand: "user",
      requestKey: null,
    });
    const existing = await pb.collection(PAYROLL_ITEMS_COLLECTION).getFullList({
      filter: `period="${period.id}"`,
      requestKey: null,
    });
    const byUser = new Map<string, AnyRecord>();
    for (const row of existing) {
      const rec = row as unknown as AnyRecord;
      byUser.set(String(rec.user ?? ""), rec);
    }

    for (const row of profiles) {
      const p = row as unknown as AnyRecord;
      const uid = String(p.user ?? "");
      if (!uid) continue;

      const expandedUser = (p.expand as AnyRecord | undefined)?.user as AnyRecord | undefined;
      const userStatus = String(expandedUser?.status ?? "active").toLowerCase();
      if (userStatus !== "active") continue;

      const baseSalary = Math.max(0, Math.round(toNumber(p.salary, 0)));
      const fixedAllowance = 0;
      const dailyRate = baseSalary / 30;
      const hourlyRate = dailyRate / 8;
      const minuteRate = hourlyRate / 60;

      const attendance = await getAttendanceStats(uid, period.start_date, period.end_date);
      const approvedLeaveDays = await getApprovedLeaveDays(uid, period.start_date, period.end_date);
      const approvedFieldDays = await getApprovedFieldActivityDays(uid, period.start_date, period.end_date);
      const requiredDays = countWeekdaysInRange(period.start_date, period.end_date);
      const bonusInfo = attendanceBonusEligible({
        setting,
        requiredDays,
        presentDays: attendance.presentDays,
        approvedLeaveDays,
        approvedFieldActivityDays: approvedFieldDays,
        lateDays: attendance.lateDays,
        lateMinutes: attendance.lateMinutes,
      });

      const overtimeAmount = await getOvertimeAmount(uid, period.start_date, period.end_date, hourlyRate);
      const encash = await getLeaveEncashment(uid, period.end_date, setting);
      const lateDeduction = Math.round(attendance.lateMinutes * minuteRate);
      const absenceDeduction = Math.round(bonusInfo.unexcusedAbsence * dailyRate);

      const gross = Math.round(
        baseSalary + fixedAllowance + overtimeAmount + bonusInfo.amount + encash.amount
      );
      const totalDeduction = Math.max(0, lateDeduction + absenceDeduction);
      const net = Math.max(0, gross - totalDeduction);

      const payload = {
        period: period.id,
        user: uid,
        profile: String(p.id ?? ""),
        division: String(p.division ?? p.department ?? ""),
        position: String(p.position ?? ""),
        employee_name: String(p.name ?? expandedUser?.name ?? expandedUser?.email ?? uid),
        base_salary: baseSalary,
        fixed_allowance: fixedAllowance,
        overtime_amount: overtimeAmount,
        bonus_amount: 0,
        attendance_bonus_eligible: bonusInfo.eligible,
        attendance_bonus_amount: bonusInfo.amount,
        attendance_bonus_reason: bonusInfo.reason,
        leave_encashment_days: encash.days,
        leave_encashment_rate: encash.rate,
        leave_encashment_amount: encash.amount,
        leave_encashment_reason:
          encash.days > 0 ? `${encash.days} hari x ${encash.rate.toLocaleString("id-ID")}` : "Tidak ada pencairan",
        late_deduction: lateDeduction,
        absence_deduction: absenceDeduction,
        loan_deduction: 0,
        other_deduction: 0,
        gross_amount: gross,
        total_deduction: totalDeduction,
        net_amount: net,
        status: "calculated",
        is_overridden: false,
      };

      const ex = byUser.get(uid);
      if (ex?.id) {
        await pb.collection(PAYROLL_ITEMS_COLLECTION).update(String(ex.id), payload);
      } else {
        await pb.collection(PAYROLL_ITEMS_COLLECTION).create(payload);
      }
    }

    return { success: true, message: "Generate payroll selesai." };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "Gagal generate payroll." };
  }
}

export async function fetchPayrollItemsByPeriod(periodId: string): Promise<PayrollItemView[]> {
  const rows = await pb.collection(PAYROLL_ITEMS_COLLECTION).getFullList({
    filter: `period="${periodId}"`,
    sort: "employee_name",
    requestKey: null,
  });
  return rows.map((row) => {
    const r = row as unknown as AnyRecord;
    return {
      id: String(r.id ?? ""),
      user: String(r.user ?? ""),
      profile: String(r.profile ?? "") || undefined,
      employee_name: String(r.employee_name ?? r.user ?? "-"),
      base_salary: Math.round(toNumber(r.base_salary, 0)),
      overtime_amount: Math.round(toNumber(r.overtime_amount, 0)),
      attendance_bonus_amount: Math.round(toNumber(r.attendance_bonus_amount, 0)),
      attendance_bonus_eligible: toBool(r.attendance_bonus_eligible, false),
      attendance_bonus_reason: String(r.attendance_bonus_reason ?? "").trim() || undefined,
      leave_encashment_amount: Math.round(toNumber(r.leave_encashment_amount, 0)),
      leave_encashment_days: Math.floor(toNumber(r.leave_encashment_days, 0)),
      leave_encashment_reason: String(r.leave_encashment_reason ?? "").trim() || undefined,
      late_deduction: Math.round(toNumber(r.late_deduction, 0)),
      absence_deduction: Math.round(toNumber(r.absence_deduction, 0)),
      gross_amount: Math.round(toNumber(r.gross_amount, 0)),
      total_deduction: Math.round(toNumber(r.total_deduction, 0)),
      net_amount: Math.round(toNumber(r.net_amount, 0)),
      status: String(r.status ?? "calculated"),
    };
  });
}

const FINAL_SLIP_STATUSES = new Set(["approved", "paid", "closed"]);

export async function fetchStaffPayrollSlips(userId: string): Promise<StaffPayrollSlip[]> {
  if (!userId?.trim()) return [];
  const rows = await pb.collection(PAYROLL_ITEMS_COLLECTION).getFullList({
    filter: `user="${userId}"`,
    sort: "-created",
    expand: "period",
    requestKey: null,
  });
  const periodCache = new Map<string, PayrollPeriod>();
  const resolvePeriod = async (periodId: string): Promise<PayrollPeriod | null> => {
    if (!periodId) return null;
    if (periodCache.has(periodId)) return periodCache.get(periodId)!;
    try {
      const raw = (await pb.collection(PAYROLL_PERIODS_COLLECTION).getOne(periodId, {
        requestKey: null,
      })) as unknown as PeriodRecord;
      const p = mapPeriod(raw);
      periodCache.set(periodId, p);
      return p;
    } catch {
      return null;
    }
  };

  const out: StaffPayrollSlip[] = [];
  for (const row of rows) {
    const r = row as unknown as AnyRecord;
    const periodId = String(r.period ?? "");
    const exp = (r.expand as AnyRecord | undefined)?.period as AnyRecord | undefined;
    const periodRow = exp ? mapPeriod(exp as PeriodRecord) : await resolvePeriod(periodId);
    if (!periodRow) continue;
    const periodStatus = String(periodRow.status ?? "").toLowerCase();
    if (!FINAL_SLIP_STATUSES.has(periodStatus)) continue;
    const base = {
      id: String(r.id ?? ""),
      user: String(r.user ?? ""),
      profile: String(r.profile ?? "") || undefined,
      employee_name: String(r.employee_name ?? r.user ?? "-"),
      base_salary: Math.round(toNumber(r.base_salary, 0)),
      overtime_amount: Math.round(toNumber(r.overtime_amount, 0)),
      attendance_bonus_amount: Math.round(toNumber(r.attendance_bonus_amount, 0)),
      attendance_bonus_eligible: toBool(r.attendance_bonus_eligible, false),
      attendance_bonus_reason: String(r.attendance_bonus_reason ?? "").trim() || undefined,
      leave_encashment_amount: Math.round(toNumber(r.leave_encashment_amount, 0)),
      leave_encashment_days: Math.floor(toNumber(r.leave_encashment_days, 0)),
      leave_encashment_reason: String(r.leave_encashment_reason ?? "").trim() || undefined,
      late_deduction: Math.round(toNumber(r.late_deduction, 0)),
      absence_deduction: Math.round(toNumber(r.absence_deduction, 0)),
      gross_amount: Math.round(toNumber(r.gross_amount, 0)),
      total_deduction: Math.round(toNumber(r.total_deduction, 0)),
      net_amount: Math.round(toNumber(r.net_amount, 0)),
      status: String(r.status ?? "calculated"),
    };
    out.push({
      ...base,
      period_key: String(periodRow.period_key ?? periodRow.name ?? "").trim() || "-",
      period_status: periodStatus,
      period_start: String(periodRow.start_date ?? "").slice(0, 10),
      period_end: String(periodRow.end_date ?? "").slice(0, 10),
      pay_date: String(periodRow.pay_date ?? "").slice(0, 10),
    });
  }
  return out;
}

export async function buildPayrollCsvForPeriod(periodId: string): Promise<{ filename: string; csv: string }> {
  const periodRaw = (await pb.collection(PAYROLL_PERIODS_COLLECTION).getOne(periodId, {
    requestKey: null,
  })) as unknown as AnyRecord;
  const period = mapPeriod(periodRaw);
  const items = await fetchPayrollItemsByPeriod(periodId);
  const header = [
    "period_key",
    "period_status",
    "employee_name",
    "base_salary",
    "overtime_amount",
    "attendance_bonus_eligible",
    "attendance_bonus_amount",
    "attendance_bonus_reason",
    "leave_encashment_days",
    "leave_encashment_amount",
    "leave_encashment_reason",
    "late_deduction",
    "absence_deduction",
    "gross_amount",
    "total_deduction",
    "net_amount",
  ];
  const lines = [header.join(",")];
  for (const x of items) {
    lines.push(
      [
        csvEscape(period.period_key),
        csvEscape(period.status),
        csvEscape(x.employee_name),
        String(x.base_salary),
        String(x.overtime_amount),
        x.attendance_bonus_eligible ? "1" : "0",
        String(x.attendance_bonus_amount),
        csvEscape(x.attendance_bonus_reason ?? ""),
        String(x.leave_encashment_days),
        String(x.leave_encashment_amount),
        csvEscape(x.leave_encashment_reason ?? ""),
        String(x.late_deduction),
        String(x.absence_deduction),
        String(x.gross_amount),
        String(x.total_deduction),
        String(x.net_amount),
      ].join(",")
    );
  }
  return { filename: `payroll-${period.period_key || periodId}.csv`, csv: lines.join("\r\n") };
}

export async function updatePayrollPeriodStatus(
  periodId: string,
  status: PayrollPeriod["status"]
): Promise<{ success: boolean; message: string }> {
  try {
    const current = mapPeriod(
      (await pb.collection(PAYROLL_PERIODS_COLLECTION).getOne(periodId, {
        requestKey: null,
      })) as unknown as PeriodRecord
    );
    if (String(current.status).toLowerCase() === "closed" && status !== "closed") {
      return { success: false, message: "Periode sudah ditutup — status tidak dapat diubah dari aplikasi." };
    }
    const payload: Record<string, unknown> = { status };
    if (status === "approved") {
      payload.approved_by = pb.authStore.model?.id ?? null;
      payload.approved_at = new Date().toISOString();
      payload.locked_at = new Date().toISOString();
    }
    if (status === "paid") {
      payload.locked_at = new Date().toISOString();
    }
    if (status === "closed") {
      payload.locked_at = new Date().toISOString();
    }
    await pb.collection(PAYROLL_PERIODS_COLLECTION).update(periodId, payload);
    return { success: true, message: `Status periode diubah ke ${status}.` };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : "Gagal update status periode." };
  }
}

export function defaultMonthPeriod(now = new Date()): {
  period_key: string;
  start_date: string;
  end_date: string;
  pay_date: string;
  name: string;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const pay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    period_key: key,
    start_date: ymd(start),
    end_date: ymd(end),
    pay_date: ymd(pay),
    name: `Payroll ${key}`,
  };
}
