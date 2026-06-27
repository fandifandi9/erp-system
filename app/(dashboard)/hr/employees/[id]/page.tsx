"use client";

import { pb } from "@/lib/pocketbase";
import { DIVISION_OPTIONS } from "@/lib/hr-employee-options";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
  parseLeaveBookingsQuotaFromProfile,
  leaveBookingsQuotaFromProfileRecord,
} from "@/lib/leave";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import {
  PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD,
  PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD,
  PROFILE_SHIFT_END_SATURDAY_FIELD,
  PROFILE_SHIFT_END_SUNDAY_FIELD,
  PROFILE_SHIFT_START_SATURDAY_FIELD,
  PROFILE_SHIFT_START_SUNDAY_FIELD,
} from "@/lib/profile";
import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { coerceBrowserTimeToHm, formalizeTimeHmInput } from "@/lib/time-hm-input";
import { useLocale } from "@/components/LocaleProvider";
import {
  HR_DEPARTMENT_LABELS_EN,
  HR_DIVISION_LABELS_EN,
  HR_POSITION_LABELS_EN,
  localizeHrOptionLabel,
} from "@/lib/i18n/hr-employee-option-labels-en";

type EmployeeUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
};

type EmployeeProfile = {
  id: string;
  name?: string;
  position?: string;
  department?: string;
  /** Kuota pengajuan cuti (pending + disetujui) per bulan kalender — opsional di PocketBase */
  leave_bookings_quota?: number;
  leave_daily_rate?: number;
  extra_bonus_amount?: number;
  extra_bonus_enabled?: boolean;
  late_deduction_rupiah_per_minute?: number;
  absence_deduction_rupiah_per_day?: number;
  salary?: number;
  office_id?: string;
  phone?: string;
  address?: string;
  division?: string;
  nik?: string;
  npwp?: string;
  employee_code?: string;
  profile_status?: string;
  late_tolerance?: number;
  shift_start?: string;
  shift_end?: string;
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  /** Lama: satu pasangan untuk Sabtu+Minggu — tampil di form jika hari baru kosong */
  shift_start_weekend?: string;
  shift_end_weekend?: string;
  join_date?: string;
  require_checkin_selfie?: boolean;
  expand?: {
    user?: EmployeeUser;
  };
};

type OfficeItem = {
  id: string;
  name?: string;
};

type SelectOption = { value: string; label: string };

/** Pilihan umum perusahaan di Indonesia — nilai disimpan sebagai teks di profile */
const POSITION_OPTIONS: SelectOption[] = [
  { value: "Direktur Utama", label: "Direktur Utama" },
  { value: "Wakil Direktur", label: "Wakil Direktur" },
  { value: "Direktur", label: "Direktur" },
  { value: "General Manager (GM)", label: "General Manager (GM)" },
  { value: "Manajer", label: "Manajer" },
  { value: "Asisten Manajer", label: "Asisten Manajer" },
  { value: "Supervisor", label: "Supervisor" },
  { value: "Koordinator", label: "Koordinator" },
  { value: "Team Leader", label: "Team Leader" },
  { value: "Staff Ahli / Senior", label: "Staff Ahli / Senior" },
  { value: "Staff", label: "Staff" },
  { value: "Officer", label: "Officer" },
  { value: "Administrasi", label: "Administrasi" },
  { value: "Akuntan", label: "Akuntan" },
  { value: "HR / Personalia", label: "HR / Personalia" },
  { value: "Marketing & Branding", label: "Marketing & Branding" },
  { value: "Sales / Penjualan", label: "Sales / Penjualan" },
  { value: "Customer Service", label: "Customer Service" },
  { value: "Operator Produksi", label: "Operator Produksi" },
  { value: "Teknisi", label: "Teknisi" },
  { value: "QC / QA", label: "QC / QA" },
  { value: "Gudang", label: "Gudang" },
  { value: "Kurir / Driver", label: "Kurir / Driver" },
  { value: "Satpam / Security", label: "Satpam / Security" },
  { value: "Office Boy / OB", label: "Office Boy / OB" },
  { value: "Resepsionis", label: "Resepsionis" },
  { value: "Magang / Intern", label: "Magang / Intern" },
];

const DEPARTMENT_OPTIONS: SelectOption[] = [
  { value: "Direksi", label: "Direksi" },
  { value: "Sekretariat Perusahaan", label: "Sekretariat Perusahaan" },
  { value: "Keuangan & Akuntansi", label: "Keuangan & Akuntansi" },
  { value: "SDM / HR", label: "SDM / HR" },
  { value: "Pemasaran & Penjualan", label: "Pemasaran & Penjualan" },
  { value: "Operasional", label: "Operasional" },
  { value: "Produksi", label: "Produksi" },
  { value: "Gudang & Logistik", label: "Gudang & Logistik" },
  { value: "Pengadaan / Procurement", label: "Pengadaan / Procurement" },
  { value: "IT / Teknologi Informasi", label: "IT / Teknologi Informasi" },
  { value: "Hukum & Kepatuhan", label: "Hukum & Kepatuhan" },
  { value: "Riset & Pengembangan (R&D)", label: "Riset & Pengembangan (R&D)" },
  { value: "Layanan Pelanggan", label: "Layanan Pelanggan" },
  { value: "Teknik & Pemeliharaan", label: "Teknik & Pemeliharaan" },
  { value: "Administrasi Umum", label: "Administrasi Umum" },
  { value: "Internal Audit", label: "Internal Audit" },
  { value: "PPIC / Perencanaan Produksi", label: "PPIC / Perencanaan Produksi" },
];

function optionValuesSet(options: SelectOption[]): Set<string> {
  return new Set(options.map((o) => o.value));
}

/** Nilai PB bisa datetime lengkap — <input type="date"> butuh yyyy-MM-dd saja */
function joinDateFromPocketBase(raw: string | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

/**
 * Kolom join_date di PocketBase sering bertipe Datetime — kirim ISO penuh
 * supaya tidak diabaikan / tidak gagal parse (hanya "yyyy-MM-dd" dari input HTML).
 */
function joinDateToPocketBase(raw: string): string | null {
  const d = raw.trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d}T12:00:00.000Z`;
  }
  return d;
}

/** Normalisasi nilai jam dari record PocketBase untuk dibandingkan dengan state form. */
function profileHmFromPb(v: unknown): string {
  if (v == null) return "";
  return formalizeTimeHmInput(String(v).trim()) || "";
}

/**
 * Jika field Sabtu/Minggu belum ada di schema `profiles`, PocketBase mengabaikan key tersebut
 * tanpa error — UI terlihat "sukses" padahal jam tidak tersimpan.
 */
type WeekendShiftErrorKey =
  | "weekendSaturday"
  | "weekendSunday"
  | "weekendClearSaturday"
  | "weekendClearSunday";

function weekendShiftRoundTripError(
  saved: Record<string, unknown>,
  satStart: string,
  satEnd: string,
  sunStart: string,
  sunEnd: string
): WeekendShiftErrorKey | null {
  const wantSat = Boolean(satStart && satEnd);
  const wantSun = Boolean(sunStart && sunEnd);
  const fs = formalizeTimeHmInput(satStart) || "";
  const fe = formalizeTimeHmInput(satEnd) || "";
  const us = formalizeTimeHmInput(sunStart) || "";
  const ue = formalizeTimeHmInput(sunEnd) || "";

  if (wantSat) {
    if (
      profileHmFromPb(saved[PROFILE_SHIFT_START_SATURDAY_FIELD]) !== fs ||
      profileHmFromPb(saved[PROFILE_SHIFT_END_SATURDAY_FIELD]) !== fe
    ) {
      return "weekendSaturday";
    }
  } else {
    if (
      profileHmFromPb(saved[PROFILE_SHIFT_START_SATURDAY_FIELD]) !== "" ||
      profileHmFromPb(saved[PROFILE_SHIFT_END_SATURDAY_FIELD]) !== ""
    ) {
      return "weekendClearSaturday";
    }
  }

  if (wantSun) {
    if (
      profileHmFromPb(saved[PROFILE_SHIFT_START_SUNDAY_FIELD]) !== us ||
      profileHmFromPb(saved[PROFILE_SHIFT_END_SUNDAY_FIELD]) !== ue
    ) {
      return "weekendSunday";
    }
  } else {
    if (
      profileHmFromPb(saved[PROFILE_SHIFT_START_SUNDAY_FIELD]) !== "" ||
      profileHmFromPb(saved[PROFILE_SHIFT_END_SUNDAY_FIELD]) !== ""
    ) {
      return "weekendClearSunday";
    }
  }

  return null;
}

export default function EmployeeDetailPage() {
  const { t, locale } = useLocale();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const positionOptions = useMemo(
    () =>
      POSITION_OPTIONS.map((o) => ({
        ...o,
        label: localizeHrOptionLabel(o.value, locale, HR_POSITION_LABELS_EN),
      })),
    [locale]
  );

  const departmentOptions = useMemo(
    () =>
      DEPARTMENT_OPTIONS.map((o) => ({
        ...o,
        label: localizeHrOptionLabel(o.value, locale, HR_DEPARTMENT_LABELS_EN),
      })),
    [locale]
  );

  const divisionOptions = useMemo(
    () =>
      DIVISION_OPTIONS.map((o) => ({
        ...o,
        label: localizeHrOptionLabel(o.value, locale, HR_DIVISION_LABELS_EN),
      })),
    [locale]
  );

  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [offices, setOffices] = useState<OfficeItem[]>([]);

  // FORM STATE
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  /** Hanya digit angka mentah; ditampilkan dengan pemisah ribuan id-ID */
  const [salaryDigits, setSalaryDigits] = useState("");
  const [officeId, setOfficeId] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [division, setDivision] = useState("");
  const [nik, setNik] = useState("");
  const [npwp, setNpwp] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [lateToleranceInput, setLateToleranceInput] = useState("10");
  const [joinDate, setJoinDate] = useState("");
  const [leaveBookingsQuota, setLeaveBookingsQuota] = useState(
    () => String(getMaxBookingsPerMonth())
  );
  const [leaveDailyRate, setLeaveDailyRate] = useState("");
  const [extraBonusAmount, setExtraBonusAmount] = useState("");
  const [extraBonusEnabled, setExtraBonusEnabled] = useState(false);
  const [lateDeductionPerMinute, setLateDeductionPerMinute] = useState("");
  const [absenceDeductionPerDay, setAbsenceDeductionPerDay] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [shiftStartSaturday, setShiftStartSaturday] = useState("");
  const [shiftEndSaturday, setShiftEndSaturday] = useState("");
  const [shiftStartSunday, setShiftStartSunday] = useState("");
  const [shiftEndSunday, setShiftEndSunday] = useState("");
  const [requireCheckinSelfie, setRequireCheckinSelfie] = useState(false);

  // =========================
  // FETCH DATA
  // =========================
  const fetchOffices = useCallback(async () => {
    try {
      const res = await pb.collection("offices").getFullList({
        filter: 'is_active=true',
        sort: 'name',
        requestKey: null,
      });

      setOffices(res as unknown as OfficeItem[]);
    } catch (err) {
      console.error("Gagal ambil offices:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch profile with user data
      const list = await pb.collection("profiles").getFullList({
        filter: `user="${id}"`,
        sort: "-updated",
        expand: "user,office_id",
        requestKey: null,
      });

      if (list.length > 1) {
        console.warn(
          `[hr/employees/${id}] Ada ${list.length} profil untuk user yang sama — memakai yang terbaru di-update.`
        );
      }

      if (list.length > 0) {
        const profileData = list[0] as unknown as EmployeeProfile;
  const userData = profileData.expand?.user;

  setUser(userData ?? null);
  setProfile(profileData);

  setName(profileData.name || userData?.name || "");
  setPosition(profileData.position || "");
  setDepartment(profileData.department || "");
  const rawSalary = profileData.salary;
  setSalaryDigits(
    rawSalary != null && !Number.isNaN(Number(rawSalary))
      ? String(Math.max(0, Math.floor(Number(rawSalary))))
      : ""
  );
  setOfficeId(profileData.office_id || "");
  setPhone(profileData.phone || "");
  setAddress(profileData.address || "");
  setDivision(profileData.division || "");
  setNik(profileData.nik || "");
  setNpwp(profileData.npwp || "");
  setEmployeeCode(profileData.employee_code || "");
  setProfileStatus(profileData.profile_status || "draft");
  setLateToleranceInput(String(Math.max(0, Math.floor(Number(profileData.late_tolerance ?? 10)))));
      setShiftStart(formalizeTimeHmInput(profileData.shift_start || "08:00") || "08:00");
      setShiftEnd(formalizeTimeHmInput(profileData.shift_end || "17:00") || "17:00");
      const legWkStart = formalizeTimeHmInput(profileData.shift_start_weekend ?? "") || "";
      const legWkEnd = formalizeTimeHmInput(profileData.shift_end_weekend ?? "") || "";
      let satS = formalizeTimeHmInput(profileData.shift_start_saturday ?? "") || "";
      let satE = formalizeTimeHmInput(profileData.shift_end_saturday ?? "") || "";
      let sunS = formalizeTimeHmInput(profileData.shift_start_sunday ?? "") || "";
      let sunE = formalizeTimeHmInput(profileData.shift_end_sunday ?? "") || "";
      if (!satS && !satE && legWkStart && legWkEnd) {
        satS = legWkStart;
        satE = legWkEnd;
      }
      if (!sunS && !sunE && legWkStart && legWkEnd) {
        sunS = legWkStart;
        sunE = legWkEnd;
      }
      setShiftStartSaturday(satS);
      setShiftEndSaturday(satE);
      setShiftStartSunday(sunS);
      setShiftEndSunday(sunE);
  setRequireCheckinSelfie(
    profileData.require_checkin_selfie === true ||
      String(profileData.require_checkin_selfie).toLowerCase() === "true" ||
      Number(profileData.require_checkin_selfie) === 1
  );
  setJoinDate(joinDateFromPocketBase(profileData.join_date));

  const parsedQ = leaveBookingsQuotaFromProfileRecord(
    profileData as unknown as Record<string, unknown>
  );
  setLeaveBookingsQuota(
    parsedQ != null ? String(parsedQ) : String(getMaxBookingsPerMonth())
  );
  const ldr = profileData.leave_daily_rate;
  setLeaveDailyRate(
    ldr != null && !Number.isNaN(Number(ldr)) ? String(Math.max(0, Math.floor(Number(ldr)))) : ""
  );
  const eba = profileData.extra_bonus_amount;
  setExtraBonusAmount(
    eba != null && !Number.isNaN(Number(eba)) ? String(Math.max(0, Math.floor(Number(eba)))) : ""
  );
  setExtraBonusEnabled(
    profileData.extra_bonus_enabled === true ||
      String(profileData.extra_bonus_enabled).toLowerCase() === "true" ||
      Number(profileData.extra_bonus_enabled) === 1
  );
  const ldm = profileData.late_deduction_rupiah_per_minute;
  setLateDeductionPerMinute(
    ldm != null && !Number.isNaN(Number(ldm)) ? String(Math.max(0, Math.floor(Number(ldm)))) : ""
  );
  const adm = profileData.absence_deduction_rupiah_per_day;
  setAbsenceDeductionPerDay(
    adm != null && !Number.isNaN(Number(adm)) ? String(Math.max(0, Math.floor(Number(adm)))) : ""
  );

} else {
  const userData = await pb.collection("users").getOne(id, {
    requestKey: null,
  });

  setUser(userData as unknown as EmployeeUser);
  setProfile(null);

  setName(userData.name || "");
  setPosition("");
  setDepartment("");
  setSalaryDigits("");
  setOfficeId("");
  setLeaveBookingsQuota(String(getMaxBookingsPerMonth()));
  setRequireCheckinSelfie(false);
}

    } catch {
      // Fallback if profile doesn't exist
      try {
        const userData = await pb.collection("users").getOne(id, {
          requestKey: null,
        });

        setUser(userData as unknown as EmployeeUser);
        setProfile(null);

        setName(userData.name || "");
        setPosition("");
        setDepartment("");
        setSalaryDigits("");
        setOfficeId("");
        setLeaveBookingsQuota(String(getMaxBookingsPerMonth()));
        setRequireCheckinSelfie(false);

      } catch (e) {
        console.error("USER ERROR:", e);
        alert(t("hr.employees.detail.userNotFound"));
        router.push("/hr/employees");
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [id, router, t]);

  useEffect(() => {
    if (!id) return;
    fetchData();
    fetchOffices();
  }, [id, fetchData, fetchOffices]);

  // =========================
  // SAVE DATA
  // =========================
  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!officeId) {
      alert(t("hr.employees.detail.errOfficeRequired"));
      return;
    }

    const salaryNum = salaryDigits ? Number(salaryDigits) : 0;
    if (!position || !department || !salaryDigits || salaryNum <= 0) {
      alert(t("hr.employees.detail.errRequiredFields"));
      return;
    }

    setSaving(true);

    let successMessage: string | null = null;
    let shouldNavigateToList = false;

    try {
      const shiftStartNorm = formalizeTimeHmInput(shiftStart) || shiftStart;
      const shiftEndNorm = formalizeTimeHmInput(shiftEnd) || shiftEnd;

      const satStart = formalizeTimeHmInput(shiftStartSaturday) || "";
      const satEnd = formalizeTimeHmInput(shiftEndSaturday) || "";
      const sunStart = formalizeTimeHmInput(shiftStartSunday) || "";
      const sunEnd = formalizeTimeHmInput(shiftEndSunday) || "";

      const satPartial = Boolean(satStart || satEnd) && !(satStart && satEnd);
      const sunPartial = Boolean(sunStart || sunEnd) && !(sunStart && sunEnd);
      if (satPartial) {
        alert(t("hr.employees.detail.errSaturdayPartial"));
        return;
      }
      if (sunPartial) {
        alert(t("hr.employees.detail.errSundayPartial"));
        return;
      }

      const shiftSatSunPayload = {
        [PROFILE_SHIFT_START_SATURDAY_FIELD]: satStart && satEnd ? satStart : "",
        [PROFILE_SHIFT_END_SATURDAY_FIELD]: satStart && satEnd ? satEnd : "",
        [PROFILE_SHIFT_START_SUNDAY_FIELD]: sunStart && sunEnd ? sunStart : "",
        [PROFILE_SHIFT_END_SUNDAY_FIELD]: sunStart && sunEnd ? sunEnd : "",
      };

      const quotaNum =
        parseLeaveBookingsQuotaFromProfile(leaveBookingsQuota) ?? getMaxBookingsPerMonth();

      const lateTol = Math.min(
        999,
        Math.max(0, parseInt(lateToleranceInput.replace(/\D/g, "") || "0", 10) || 0)
      );

      // Keep users.name aligned with HR profile name.
      await pb.collection("users").update(user.id, { name });

      let savedRecord: Record<string, unknown>;

      if (!profile) {
        savedRecord = (await pb.collection("profiles").create({
          user: user.id,
          name,
          position,
          department,
          salary: salaryNum,
          office_id: officeId,
          phone,
          address,
          division,
          nik,
          npwp,
          employee_code: employeeCode,
          profile_status: profileStatus,
          shift_start: shiftStartNorm,
          shift_end: shiftEndNorm,
          late_tolerance: lateTol,
          join_date: joinDateToPocketBase(joinDate),
          require_checkin_selfie: requireCheckinSelfie,
          [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: quotaNum,
          leave_daily_rate: parseIntegerInput(leaveDailyRate),
          extra_bonus_amount: parseIntegerInput(extraBonusAmount),
          extra_bonus_enabled: extraBonusEnabled,
          [PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD]: parseIntegerInput(lateDeductionPerMinute),
          [PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD]: parseIntegerInput(absenceDeductionPerDay),
          ...shiftSatSunPayload,
        })) as unknown as Record<string, unknown>;

        successMessage = t("hr.employees.detail.profileCreated");
      } else {
        savedRecord = (await pb.collection("profiles").update(profile.id, {
          name,
          position,
          department,
          salary: salaryNum,
          office_id: officeId,
          phone,
          address,
          division,
          nik,
          npwp,
          employee_code: employeeCode,
          profile_status: profileStatus,
          shift_start: shiftStartNorm,
          shift_end: shiftEndNorm,
          late_tolerance: lateTol,
          join_date: joinDateToPocketBase(joinDate),
          require_checkin_selfie: requireCheckinSelfie,
          [PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD]: quotaNum,
          leave_daily_rate: parseIntegerInput(leaveDailyRate),
          extra_bonus_amount: parseIntegerInput(extraBonusAmount),
          extra_bonus_enabled: extraBonusEnabled,
          [PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD]: parseIntegerInput(lateDeductionPerMinute),
          [PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD]: parseIntegerInput(absenceDeductionPerDay),
          ...shiftSatSunPayload,
        })) as unknown as Record<string, unknown>;

        successMessage = t("hr.employees.detail.saved");
      }

      const weekendErr = weekendShiftRoundTripError(
        savedRecord,
        satStart,
        satEnd,
        sunStart,
        sunEnd
      );
      if (weekendErr) {
        successMessage = null;
        alert(
          t("hr.employees.detail.weekendNotSaved", {
            day: t(`hr.employees.detail.${weekendErr}`),
          })
        );
        return;
      }

      shouldNavigateToList = true;
    } catch (err: unknown) {
      const maybeAbort = typeof err === "object" && err !== null && "isAbort" in err && Boolean((err as { isAbort?: unknown }).isAbort);
      if (maybeAbort) return;

      console.error("SAVE ERROR:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(t("hr.employees.detail.saveFailed", { message }));
    } finally {
      setSaving(false);
    }

    if (successMessage) {
      alert(successMessage);
    }
    if (shouldNavigateToList) {
      router.push("/hr/employees");
    }
  };

  // =========================
  // LOADING
  // =========================
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-500">{t("hr.employees.detail.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // =========================
  // UI
  // =========================
  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-6 overflow-x-hidden px-4 py-6 sm:px-6">

      {/* HEADER */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-800 sm:text-2xl">
            {t("hr.employees.detail.title")}
          </h1>
          <p className="mt-1 break-words text-sm text-slate-500">
            {t("hr.employees.detail.subtitle")}
          </p>
        </div>

        <button
          onClick={() => router.back()}
          className="shrink-0 self-start text-sm text-slate-500 transition hover:text-slate-800"
        >
          {t("hr.employees.detail.back")}
        </button>
      </div>

      {/* WARNING IF PROFILE DOESN'T EXIST */}
      {!profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          <p className="font-semibold">{t("hr.employees.detail.profileMissingTitle")}</p>
          <p>{t("hr.employees.detail.profileMissingDesc")}</p>
        </div>
      )}

      {/* ACCOUNT INFO */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {t("hr.employees.detail.accountSection")}
        </h2>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">

          <Input label={t("hr.employees.detail.name")} value={name} onChange={setName} />
          <Input label={t("hr.employees.detail.email")} value={user.email || ""} disabled />
          <Input label={t("hr.employees.detail.role")} value={user.role || ""} disabled />
          <Input
            label={t("hr.employees.detail.status")}
            value={user.status || "active"}
            disabled
          />

        </div>
      </div>

      {/* HR DATA */}
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          {t("hr.employees.detail.hrSection")}
        </h2>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">

          <SelectField
            label={t("hr.employees.detail.position")}
            hint={t("hr.employees.detail.positionHint")}
            value={position}
            onChange={setPosition}
            options={positionOptions}
            placeholder={t("hr.employees.detail.positionPlaceholder")}
            legacySuffix={t("hr.employees.detail.legacyData")}
            emptyOptional={t("hr.employees.detail.selectEmpty")}
            emptyRequired={t("hr.employees.detail.selectChoose")}
          />

          <SelectField
            label={t("hr.employees.detail.department")}
            hint={t("hr.employees.detail.departmentHint")}
            value={department}
            onChange={setDepartment}
            options={departmentOptions}
            placeholder={t("hr.employees.detail.departmentPlaceholder")}
            legacySuffix={t("hr.employees.detail.legacyData")}
            emptyOptional={t("hr.employees.detail.selectEmpty")}
            emptyRequired={t("hr.employees.detail.selectChoose")}
          />

          <SalaryInput
            label={t("hr.employees.detail.salary")}
            digits={salaryDigits}
            onDigitsChange={setSalaryDigits}
            placeholder={t("hr.employees.detail.salaryPlaceholder")}
            formatHint={t("hr.employees.detail.salaryFormatHint")}
          />

          <Input label={t("hr.employees.detail.phone")} value={phone} onChange={setPhone} />
          <Input label={t("hr.employees.detail.address")} value={address} onChange={setAddress} />
          <SelectField
            label={t("hr.employees.detail.division")}
            hint={t("hr.employees.detail.divisionHint")}
            value={division}
            onChange={setDivision}
            options={divisionOptions}
            placeholder={t("hr.employees.detail.divisionPlaceholder")}
            optional
            legacySuffix={t("hr.employees.detail.legacyData")}
            emptyOptional={t("hr.employees.detail.selectEmpty")}
            emptyRequired={t("hr.employees.detail.selectChoose")}
          />
          <Input
            label={t("hr.employees.detail.leaveQuota")}
            hint={t("hr.employees.detail.leaveQuotaHint", { default: String(getMaxBookingsPerMonth()) })}
            type="number"
            value={leaveBookingsQuota}
            onChange={setLeaveBookingsQuota}
            placeholder={`${getMaxBookingsPerMonth()}`}
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.leaveDailyRate")}
            hint={t("hr.employees.detail.leaveDailyRateHint")}
            digits={leaveDailyRate}
            onDigitsChange={setLeaveDailyRate}
            placeholder={t("hr.employees.detail.leaveDailyRatePlaceholder")}
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.extraBonus")}
            hint={t("hr.employees.detail.extraBonusHint")}
            digits={extraBonusAmount}
            onDigitsChange={setExtraBonusAmount}
            placeholder={t("hr.employees.detail.extraBonusPlaceholder")}
          />
          <label className="col-span-2 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={extraBonusEnabled}
              onChange={(e) => setExtraBonusEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            {t("hr.employees.detail.extraBonusEnabled")}
          </label>
          <IntegerDigitsInput
            label={t("hr.employees.detail.lateDeduction")}
            hint={t("hr.employees.detail.lateDeductionHint")}
            digits={lateDeductionPerMinute}
            onDigitsChange={setLateDeductionPerMinute}
            placeholder="0"
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.absenceDeduction")}
            hint={t("hr.employees.detail.absenceDeductionHint")}
            digits={absenceDeductionPerDay}
            onDigitsChange={setAbsenceDeductionPerDay}
            placeholder="0"
          />
          <Input label={t("hr.employees.detail.nik")} value={nik} onChange={setNik} />
          <Input label={t("hr.employees.detail.npwp")} value={npwp} onChange={setNpwp} />
          <Input label={t("hr.employees.detail.employeeCode")} value={employeeCode} onChange={setEmployeeCode} />
          
          {/* TANGGAL BERGABUNG */}
          <div className="min-w-0">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {t("hr.employees.detail.joinDate")}
            </label>
            <input
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
            />
          </div>

          {/* SHIFT */}
          <div className="col-span-2 mt-4 min-w-0">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">
              {t("hr.employees.detail.workHours")}
            </h3>

            <p className="mb-2 text-xs text-slate-500">{t("hr.employees.detail.weekdayDefault")}</p>
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
                <div className="min-w-0">
                  <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                    {t("hr.employees.detail.clockIn")}
                  </label>
                  <input
                    type="time"
                    step={60}
                    value={shiftStart}
                    onChange={(e) => setShiftStart(coerceBrowserTimeToHm(e.target.value))}
                    onBlur={() => setShiftStart((v) => formalizeTimeHmInput(v))}
                    className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                  />
                </div>

                <div className="min-w-0">
                  <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                    {t("hr.employees.detail.clockOut")}
                  </label>
                  <input
                    type="time"
                    step={60}
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(coerceBrowserTimeToHm(e.target.value))}
                    onBlur={() => setShiftEnd((v) => formalizeTimeHmInput(v))}
                    className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                  />
                </div>
                    </div>

            <p className="mt-4 mb-2 text-xs text-slate-500">
              {t("hr.employees.detail.saturdayOptional")}
            </p>
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                  {t("hr.employees.detail.saturdayIn")}
                </label>
                <input
                  type="time"
                  step={60}
                  value={shiftStartSaturday}
                  onChange={(e) => setShiftStartSaturday(coerceBrowserTimeToHm(e.target.value))}
                  onBlur={() => setShiftStartSaturday((v) => formalizeTimeHmInput(v))}
                  className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                />
              </div>
              <div className="min-w-0">
                <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                  {t("hr.employees.detail.saturdayOut")}
                </label>
                <input
                  type="time"
                  step={60}
                  value={shiftEndSaturday}
                  onChange={(e) => setShiftEndSaturday(coerceBrowserTimeToHm(e.target.value))}
                  onBlur={() => setShiftEndSaturday((v) => formalizeTimeHmInput(v))}
                  className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                />
              </div>
            </div>

            <p className="mt-4 mb-2 text-xs text-slate-500">
              {t("hr.employees.detail.sundayOptional")}
            </p>
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                  {t("hr.employees.detail.sundayIn")}
                </label>
                <input
                  type="time"
                  step={60}
                  value={shiftStartSunday}
                  onChange={(e) => setShiftStartSunday(coerceBrowserTimeToHm(e.target.value))}
                  onBlur={() => setShiftStartSunday((v) => formalizeTimeHmInput(v))}
                  className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                />
              </div>
              <div className="min-w-0">
                <label className="text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
                  {t("hr.employees.detail.sundayOut")}
                </label>
                <input
                  type="time"
                  step={60}
                  value={shiftEndSunday}
                  onChange={(e) => setShiftEndSunday(coerceBrowserTimeToHm(e.target.value))}
                  onBlur={() => setShiftEndSunday((v) => formalizeTimeHmInput(v))}
                  className={`mt-1 overflow-x-auto font-mono tabular-nums ${FORM_CONTROL}`}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t("hr.employees.detail.lateToleranceNote")}
            </p>
                    </div>
                    
                    {/* TOLERANSI — teks + inputMode numeric (type=number sering bermasalah saat diketik) */}
                    <Input
                      label={t("hr.employees.detail.lateTolerance")}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={lateToleranceInput}
                      onChange={(val) => {
                        const digits = val.replace(/\D/g, "");
                        if (digits.length > 3) return;
                        setLateToleranceInput(digits);
                      }}
                      onBlur={() => {
                        const n = parseInt(lateToleranceInput || "0", 10);
                        const c = Number.isNaN(n) ? 0 : Math.min(999, Math.max(0, n));
                        setLateToleranceInput(String(c));
                      }}
                      placeholder={t("hr.employees.detail.lateTolerancePlaceholder")}
                    />

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 md:col-span-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={requireCheckinSelfie}
              onChange={(e) => setRequireCheckinSelfie(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">
                {t("hr.employees.detail.selfieTitle")}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                {t("hr.employees.detail.selfieDesc")}
              </span>
            </span>
          </label>

          {/* OFFICE DROPDOWN */}
          <div className="min-w-0 md:col-span-2">
            <label className="text-sm text-slate-500 block mb-1">
              {t("hr.employees.detail.office")} {!officeId && <span className="text-red-500">{t("hr.employees.detail.officeRequired")}</span>}
            </label>
            <StyledSelect value={officeId} onChange={setOfficeId} placeholderTone>
              <option value="">{t("hr.employees.detail.officePlaceholder")}</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </StyledSelect>
            {offices.length === 0 && (
              <p className="text-xs text-red-500 mt-1">
                {t("hr.employees.detail.noActiveOffice")}
              </p>
            )}
          </div>

        </div>

        {/* ACTION */}
        <div className="flex justify-end mt-6 gap-3">
          <button
            onClick={() => router.back()}
            className="px-6 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !officeId}
            className="bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t("hr.common.saving") : t("hr.employees.detail.saveChanges")}
          </button>
        </div>
      </div>

      {/* INFO */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <p className="font-semibold mb-1">{t("hr.employees.detail.notesTitle")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("hr.employees.detail.noteRequired")}</li>
          <li>{t("hr.employees.detail.noteOffice")}</li>
          <li>{t("hr.employees.detail.noteProfiles")}</li>
        </ul>
      </div>

    </div>
  );
}

/** Gaya kontrol form — min-w-0 + text-base di HP (hindari teks tertimpa / zoom iOS); overflow horizontal aman. */
const FORM_CONTROL =
  "w-full min-w-0 max-w-full min-h-[2.75rem] rounded-xl border border-slate-300 bg-white px-3 py-3 text-base leading-snug outline-none transition-colors " +
  "text-slate-900 placeholder:text-slate-500 hover:border-slate-400 " +
  "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 " +
  "md:min-h-0 md:text-sm " +
  "[-webkit-tap-highlight-color:transparent]";

// =========================
// SELECT NATIF — tampilan seragam (chevron custom)
// =========================
function StyledSelect({
  value,
  onChange,
  children,
  placeholderTone,
}: {
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
  /** true = teks placeholder abu saat belum ada pilihan */
  placeholderTone?: boolean;
}) {
  const empty = placeholderTone !== false && value === "";
  return (
    <div className="relative mt-1 min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FORM_CONTROL} appearance-none overflow-x-auto text-left pr-10 ${empty ? "text-slate-400" : "text-slate-800"}`}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400"
        aria-hidden
      >
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>
  );
}

// =========================
// SELECT FIELD (Bahasa Indonesia + opsi tetap)
// =========================
function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder,
  optional = false,
  legacySuffix = "(data tersimpan)",
  emptyOptional = "— Kosongkan jika tidak dipakai —",
  emptyRequired = "— Pilih —",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  placeholder?: string;
  optional?: boolean;
  legacySuffix?: string;
  emptyOptional?: string;
  emptyRequired?: string;
}) {
  const known = optionValuesSet(options);
  const isLegacy = Boolean(value && !known.has(value));

  return (
    <div className="min-w-0">
      <label className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold leading-none text-slate-500"
            title={hint}
            aria-label={hint}
            role="img"
          >
            ?
          </span>
        ) : null}
      </label>
      <StyledSelect
        value={value}
        onChange={onChange}
        placeholderTone
      >
        <option value="">
          {placeholder || (optional ? emptyOptional : emptyRequired)}
        </option>
        {isLegacy && (
          <option value={value}>
            {value} {legacySuffix}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </StyledSelect>
    </div>
  );
}

// =========================
// INPUT COMPONENT
// =========================
interface InputProps {
  label: string;
  hint?: string;
  value: string | number;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}

function Input({
  label,
  hint,
  value,
  onChange,
  onBlur,
  disabled = false,
  placeholder = "",
  type = "text",
  inputMode,
  autoComplete,
}: InputProps) {
  return (
    <div className="min-w-0">
      <label className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        <span className="min-w-0 break-words">{label}</span>
        {hint ? (
          <span
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold leading-none text-slate-500"
            title={hint}
            aria-label={hint}
            role="img"
          >
            ?
          </span>
        ) : null}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onBlur={onBlur}
        onChange={(e) => onChange?.(e.target.value)}
        className={`mt-1 overflow-x-auto ${FORM_CONTROL} ${
          disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
        }`}
      />
    </div>
  );
}

function formatSalaryIdDisplay(digits: string): string {
  if (!digits) return "";
  return formatIntegerId(parseIntegerInput(digits));
}

function IntegerDigitsInput({
  label,
  hint,
  digits,
  onDigitsChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  digits: string;
  onDigitsChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">
        {label}
      </label>
      {hint ? (
        <p className="mb-1 break-words text-xs leading-snug text-slate-500 sm:text-slate-400">{hint}</p>
      ) : null}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={digits ? formatIntegerId(parseIntegerInput(digits)) : ""}
        placeholder={placeholder}
        onChange={(e) => onDigitsChange(e.target.value.replace(/\D/g, ""))}
        className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
      />
    </div>
  );
}

function SalaryInput({
  label,
  digits,
  onDigitsChange,
  placeholder,
  formatHint,
}: {
  label: string;
  digits: string;
  onDigitsChange: (next: string) => void;
  placeholder?: string;
  formatHint?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700 sm:font-normal sm:text-slate-500">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatSalaryIdDisplay(digits)}
        placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "");
          onDigitsChange(next);
        }}
        className={`mt-1 overflow-x-auto ${FORM_CONTROL}`}
      />
      {formatHint ? (
        <p className="mt-1 break-words text-xs leading-snug text-slate-500 sm:text-slate-400">
          {formatHint}
        </p>
      ) : null}
    </div>
  );
}
