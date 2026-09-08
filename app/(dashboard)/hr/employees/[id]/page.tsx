"use client";

import { pb } from "@/lib/pocketbase";
import {
  fetchAllHrEmployeeOptions,
  type EmployeeSelectOption,
  type HrOptionCategory,
} from "@/lib/hr-employee-options";
import { HrManageableSelectField } from "@/components/hr/HrManageableSelectField";
import { HrManagerPickerField } from "@/components/hr/HrManagerPickerField";
import { HrEntitySelectField } from "@/components/hr/HrEntitySelectField";
import {
  getMaxBookingsPerMonth,
  PROFILE_LEAVE_BOOKINGS_QUOTA_FIELD,
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
import { canAccessEmployeeManagement } from "@/lib/capabilities/web-access";
import { hrApiGetEmployee, hrApiPatchEmployee } from "@/lib/hr/hr-api-client";
import { isDashboardAccessEnabled } from "@/lib/hr/employee-role-presets";
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
  role_code?: string;
  inventory_role?: string;
  hr_role_preset?: string;
  dashboard_access?: boolean;
  status?: string;
};

type EmployeeProfile = {
  id: string;
  name?: string;
  email?: string;
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
  manager?: string;
  expand?: {
    user?: EmployeeUser;
  };
};

type OfficeItem = {
  id: string;
  name?: string;
};

type OrgPositionOption = {
  id: string;
  name: string;
  filled: boolean;
  parentPositionId: string | null;
  holderName: string | null;
};

/** Atasan langsung dari pohon jabatan (parent position + holder). */
function superiorLabelFromOrgStructure(
  positionId: string,
  positions: OrgPositionOption[],
): string {
  const pid = positionId.trim();
  if (!pid) return "—";
  const pos = positions.find((p) => p.id === pid);
  if (!pos) return "—";
  if (!pos.parentPositionId) return "Jabatan akar / tanpa induk";
  const parent = positions.find((p) => p.id === pos.parentPositionId);
  if (!parent) return "—";
  if (parent.holderName) return `${parent.holderName} · ${parent.name}`;
  if (!parent.filled) return `${parent.name} (jabatan induk vacant)`;
  return parent.name;
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

/** Angka > 0 untuk tampilan form; 0/null/kosong → field kosong. */
function positiveIntStringOrEmpty(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.floor(n));
}

/** Kosong di form → null di PocketBase (bukan 0 atau default). */
function optionalStoredInt(raw: string): number | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
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

  const authUser = pb.authStore.model as Record<string, unknown> | null;
  const hasPageAccess = canAccessEmployeeManagement(authUser);

  useEffect(() => {
    if (!hasPageAccess) {
      router.replace("/hr/employees");
    }
  }, [hasPageAccess, router]);

  const [hrOptions, setHrOptions] = useState<Record<HrOptionCategory, EmployeeSelectOption[]>>({
    position: [],
    department: [],
    division: [],
  });

  const [canManageHrOptions, setCanManageHrOptions] = useState(false);
  const [canViewSensitive, setCanViewSensitive] = useState(false);
  const [canUpdateEmployee, setCanUpdateEmployee] = useState(false);
  const [canAssignManager, setCanAssignManager] = useState(false);
  const [canViewEntities, setCanViewEntities] = useState(false);
  const [canAssignMembership, setCanAssignMembership] = useState(false);
  const [canViewEmployee, setCanViewEmployee] = useState(false);

  const reloadHrOptions = useCallback(async () => {
    setHrOptions(await fetchAllHrEmployeeOptions());
  }, []);

  const localizeOptions = useCallback(
    (items: EmployeeSelectOption[], labelsEn: Record<string, string>) =>
      items.map((o) => ({
        ...o,
        label: localizeHrOptionLabel(o.value, locale, labelsEn),
      })),
    [locale],
  );

  const positionOptions = useMemo(
    () => localizeOptions(hrOptions.position, HR_POSITION_LABELS_EN),
    [hrOptions.position, localizeOptions],
  );

  const departmentOptions = useMemo(
    () => localizeOptions(hrOptions.department, HR_DEPARTMENT_LABELS_EN),
    [hrOptions.department, localizeOptions],
  );

  const divisionOptions = useMemo(
    () => localizeOptions(hrOptions.division, HR_DIVISION_LABELS_EN),
    [hrOptions.division, localizeOptions],
  );

  const hrManageLabels = useMemo(
    () => ({
      add: t("hr.employees.detail.addOption"),
      remove: t("hr.employees.detail.removeOption"),
      newPlaceholder: t("hr.employees.detail.newOptionPlaceholder"),
      optionExists: t("hr.employees.detail.optionExists"),
      addFailed: t("hr.employees.detail.optionAddFailed"),
      removeFailed: t("hr.employees.detail.optionRemoveFailed"),
      removeConfirm: t("hr.employees.detail.removeOptionConfirm"),
      legacySuffix: t("hr.employees.detail.legacyData"),
      emptyOptional: t("hr.employees.detail.selectEmpty"),
      emptyRequired: t("hr.employees.detail.selectChoose"),
      search: t("hr.employees.detail.searchOption"),
      noResults: t("hr.employees.detail.noOptionResults"),
      cancel: t("hr.employees.detail.cancelAdd"),
      addNew: "",
    }),
    [t],
  );

  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
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
  const [lateToleranceInput, setLateToleranceInput] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [leaveBookingsQuota, setLeaveBookingsQuota] = useState("");
  const [leaveDailyRate, setLeaveDailyRate] = useState("");
  const [extraBonusAmount, setExtraBonusAmount] = useState("");
  const [extraBonusEnabled, setExtraBonusEnabled] = useState(false);
  const [lateDeductionPerMinute, setLateDeductionPerMinute] = useState("");
  const [absenceDeductionPerDay, setAbsenceDeductionPerDay] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [shiftStartSaturday, setShiftStartSaturday] = useState("");
  const [shiftEndSaturday, setShiftEndSaturday] = useState("");
  const [shiftStartSunday, setShiftStartSunday] = useState("");
  const [shiftEndSunday, setShiftEndSunday] = useState("");
  const [requireCheckinSelfie, setRequireCheckinSelfie] = useState(false);
  const [managerUserId, setManagerUserId] = useState("");
  const [orgPositionId, setOrgPositionId] = useState("");
  const [orgPositions, setOrgPositions] = useState<OrgPositionOption[]>([]);
  const [derivedSuperiorLabel, setDerivedSuperiorLabel] = useState("—");
  const [orgContextCompanyId, setOrgContextCompanyId] = useState<string | null>(null);
  const [otherOrgAssignments, setOtherOrgAssignments] = useState<
    Array<{ companyId: string; orgPositionId: string }>
  >([]);
  const [managerIsDerived, setManagerIsDerived] = useState(false);
  const [isSelfProfile, setIsSelfProfile] = useState(false);
  const [primaryEntityId, setPrimaryEntityId] = useState("");

  // =========================
  // FETCH DATA
  // =========================
  const applyDetailPayload = useCallback(
    (data: Awaited<ReturnType<typeof hrApiGetEmployee>>) => {
      const userData = data.user as EmployeeUser;
      const profileData = data.profile as EmployeeProfile | null;

      setCanUpdateEmployee(Boolean(data.actor.canUpdate));
      setCanViewSensitive(Boolean(data.actor.canViewSensitive));
      setCanManageHrOptions(Boolean(data.actor.canUpdate));
      setCanAssignManager(Boolean(data.actor.canAssignManager));
      setCanViewEntities(Boolean(data.actor.canViewEntities));
      setCanAssignMembership(Boolean(data.actor.canAssignMembership));
      setCanViewEmployee(Boolean(data.actor.canView));
      setOffices(data.offices || []);

      setUser(userData);
      setProfile(profileData);
      setAccountEmail(
        String(profileData?.email || "").trim() || String(userData.email || "").trim(),
      );
      setPrimaryEntityId(data.primaryEntityId || "");

      setName(profileData?.name || userData.name || "");
      setPosition(profileData?.position || "");
      setDepartment(profileData?.department || "");
      setSalaryDigits(positiveIntStringOrEmpty(profileData?.salary));
      setOfficeId(profileData?.office_id || "");
      setPhone(profileData?.phone || "");
      setAddress(profileData?.address || "");
      setDivision(profileData?.division || "");

      const org = data.organization;
      setOrgPositionId(org?.orgPositionId || "");
      setOrgPositions(
        (org?.positions || []).map((p) => ({
          id: p.id,
          name: p.name,
          filled: Boolean(p.filled),
          parentPositionId: p.parentPositionId ?? null,
          holderName:
            String(p.holderName ?? "").trim() ||
            (Array.isArray(p.holderNames) && p.holderNames[0]
              ? String(p.holderNames[0]).trim()
              : "") ||
            null,
        })),
      );
      setManagerIsDerived(Boolean(org?.managerIsDerived));
      setIsSelfProfile(Boolean(org?.isSelf));
      setOrgContextCompanyId(org?.contextCompanyId ?? null);
      setOtherOrgAssignments(
        (org?.otherAssignments || []).map((a) => ({
          companyId: a.companyId,
          orgPositionId: a.orgPositionId,
        })),
      );
      const ds = org?.derivedSuperior;
      if (ds?.parentPositionName) {
        setDerivedSuperiorLabel(
          ds.vacant
            ? `${ds.parentPositionName} (jabatan induk vacant)`
            : ds.superiorName
              ? `${ds.superiorName} · ${ds.parentPositionName}`
              : ds.parentPositionName,
        );
      } else {
        setDerivedSuperiorLabel(org?.orgPositionId ? "Jabatan akar / tanpa induk" : "—");
      }

      const rawMgr = profileData?.manager as unknown;
      if (typeof rawMgr === "string") setManagerUserId(rawMgr);
      else if (rawMgr && typeof rawMgr === "object" && "id" in rawMgr) {
        setManagerUserId(String((rawMgr as { id: string }).id));
      } else setManagerUserId("");

      setNik(profileData?.nik || "");
      setNpwp(profileData?.npwp || "");
      setEmployeeCode(profileData?.employee_code || "");
      setProfileStatus(profileData?.profile_status || "");
      setLateToleranceInput(
        profileData?.late_tolerance != null && !Number.isNaN(Number(profileData.late_tolerance))
          ? String(Math.max(0, Math.floor(Number(profileData.late_tolerance))))
          : "",
      );
      setShiftStart(formalizeTimeHmInput(profileData?.shift_start || "") || "");
      setShiftEnd(formalizeTimeHmInput(profileData?.shift_end || "") || "");
      const legWkStart = formalizeTimeHmInput(profileData?.shift_start_weekend ?? "") || "";
      const legWkEnd = formalizeTimeHmInput(profileData?.shift_end_weekend ?? "") || "";
      let satS = formalizeTimeHmInput(profileData?.shift_start_saturday ?? "") || "";
      let satE = formalizeTimeHmInput(profileData?.shift_end_saturday ?? "") || "";
      let sunS = formalizeTimeHmInput(profileData?.shift_start_sunday ?? "") || "";
      let sunE = formalizeTimeHmInput(profileData?.shift_end_sunday ?? "") || "";
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
        profileData?.require_checkin_selfie === true ||
          String(profileData?.require_checkin_selfie).toLowerCase() === "true" ||
          Number(profileData?.require_checkin_selfie) === 1,
      );
      setJoinDate(joinDateFromPocketBase(profileData?.join_date));

      const defaultQuota = data.defaults?.leaveBookingsQuota ?? getMaxBookingsPerMonth();
      const parsedQ = profileData
        ? leaveBookingsQuotaFromProfileRecord(profileData as unknown as Record<string, unknown>)
        : null;
      setLeaveBookingsQuota(parsedQ != null && parsedQ > 0 ? String(parsedQ) : "");
      setLeaveDailyRate(positiveIntStringOrEmpty(profileData?.leave_daily_rate));
      setExtraBonusAmount(positiveIntStringOrEmpty(profileData?.extra_bonus_amount));
      setExtraBonusEnabled(
        profileData?.extra_bonus_enabled === true ||
          String(profileData?.extra_bonus_enabled).toLowerCase() === "true" ||
          Number(profileData?.extra_bonus_enabled) === 1,
      );
      setLateDeductionPerMinute(
        positiveIntStringOrEmpty(profileData?.late_deduction_rupiah_per_minute),
      );
      setAbsenceDeductionPerDay(
        positiveIntStringOrEmpty(profileData?.absence_deduction_rupiah_per_day),
      );
      void defaultQuota;
    },
    [],
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await hrApiGetEmployee(id);
      applyDetailPayload(data);
    } catch (err) {
      console.error("USER ERROR:", err);
      alert(t("hr.employees.detail.userNotFound"));
      router.push("/hr/employees");
    } finally {
      setLoading(false);
    }
  }, [id, router, t, applyDetailPayload]);

  useEffect(() => {
    if (!id) return;
    fetchData();
    void reloadHrOptions();
  }, [id, fetchData, reloadHrOptions]);

  // =========================
  // SAVE DATA
  // =========================
  const handleSave = async () => {
    if (!user || !canUpdateEmployee) {
      alert(t("hr.common.noAccess"));
      return;
    }

    // Validation — hanya kantor wajib; kolom lain boleh kosong
    if (!officeId) {
      alert(t("hr.employees.detail.errOfficeRequired"));
      return;
    }

    setSaving(true);

    let successMessage: string | null = null;
    let shouldNavigateToList = false;

    try {
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

      await hrApiPatchEmployee(user.id, {
        name,
        email: accountEmail || user.email || "",
        office_id: officeId,
        position: position || "",
        department: department || "",
        division: division || "",
        phone: phone || "",
        address: address || "",
        employee_code: employeeCode || "",
        join_date: joinDate || "",
        late_tolerance: lateToleranceInput || "",
        shift_start: shiftStart || "",
        shift_end: shiftEnd || "",
        shift_start_saturday: shiftStartSaturday || "",
        shift_end_saturday: shiftEndSaturday || "",
        shift_start_sunday: shiftStartSunday || "",
        shift_end_sunday: shiftEndSunday || "",
        require_checkin_selfie: requireCheckinSelfie,
        leave_bookings_quota: leaveBookingsQuota || "",
        ...(!isSelfProfile && !managerIsDerived
          ? { org_position_id: orgPositionId || null }
          : {}),
        ...(!managerIsDerived && !orgPositionId && canAssignManager && !isSelfProfile
          ? { manager_user_id: managerUserId || null }
          : {}),
        ...(canAssignMembership && primaryEntityId
          ? { primary_entity_id: primaryEntityId }
          : {}),
        ...(canViewSensitive
          ? {
              salary_digits: salaryDigits || "",
              nik: nik || "",
              npwp: npwp || "",
              leave_daily_rate: leaveDailyRate || "",
              extra_bonus_amount: extraBonusAmount || "",
              extra_bonus_enabled: extraBonusEnabled,
              late_deduction_per_minute: lateDeductionPerMinute || "",
              absence_deduction_per_day: absenceDeductionPerDay || "",
            }
          : {}),
      });

      successMessage = profile
        ? t("hr.employees.detail.saved")
        : t("hr.employees.detail.profileCreated");
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

  const dashboardAccess = isDashboardAccessEnabled(user);

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

        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          {canViewEmployee && (
            <button
              type="button"
              onClick={() => router.push(`/hr/employees/${id}/access-preview`)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Access Preview
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="text-sm text-slate-500 transition hover:text-slate-800"
          >
            {t("hr.employees.detail.back")}
          </button>
        </div>
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
          <Input label={t("hr.employees.detail.email")} value={accountEmail} disabled />
          <Input
            label={t("hr.employees.detail.dashboardAccess")}
            value={dashboardAccess ? t("hr.common.yes") : t("hr.common.no")}
            disabled
          />
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

          <HrEntitySelectField
            value={primaryEntityId}
            onChange={setPrimaryEntityId}
            allowView={canViewEntities}
            allowAssign={canAssignMembership}
            disabled={!canUpdateEmployee || !canAssignMembership}
          />

          <div className="min-w-0">
            <label className="text-sm text-slate-500 block mb-1">
              {t("hr.employees.detail.office")}{" "}
              {!officeId && <span className="text-red-500">{t("hr.employees.detail.officeRequired")}</span>}
            </label>
            <p className="mb-1 text-xs text-slate-500">
              Lokasi kantor untuk validasi GPS saat absensi. Atur di menu HR → Kantor jika belum ada.
            </p>
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

          {orgPositionId ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Jabatan</label>
              <input
                readOnly
                value={
                  orgPositions.find((p) => p.id === orgPositionId)?.name ||
                  position ||
                  ""
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              />
              <p className="mt-1 text-xs text-slate-500">
                SSOT dari Struktur Organisasi / assignment (konteks working entity
                {orgContextCompanyId ? ` · ${orgContextCompanyId}` : ""}).
                {isSelfProfile ? " Tidak dapat diubah sendiri." : " Ubah via Pengaturan → Struktur Organisasi."}
              </p>
              {otherOrgAssignments.length > 0 ? (
                <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">Assignment lain</p>
                  <ul className="mt-1 list-disc pl-4">
                    {otherOrgAssignments.map((a) => (
                      <li key={`${a.companyId}-${a.orgPositionId}`}>
                        {a.companyId} → {a.orgPositionId}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Jabatan organisasi
                </label>
                <StyledSelect
                  value={orgPositionId}
                  onChange={(nextId) => {
                    setOrgPositionId(nextId);
                    setManagerIsDerived(Boolean(nextId));
                    setDerivedSuperiorLabel(
                      superiorLabelFromOrgStructure(nextId, orgPositions),
                    );
                    const selected = orgPositions.find((p) => p.id === nextId);
                    if (selected?.name) setPosition(selected.name);
                  }}
                  disabled={!canUpdateEmployee || isSelfProfile}
                >
                  <option value="">— Belum di-link ke struktur —</option>
                  {orgPositions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.filled ? "" : " (vacant slot OK)"}
                    </option>
                  ))}
                </StyledSelect>
                <p className="mt-1 text-xs text-slate-500">
                  Hierarki Parent→Child di Struktur Organisasi.{" "}
                  {isSelfProfile ? "Tidak dapat mengubah jabatan sendiri." : null}
                </p>
              </div>

              <HrManageableSelectField
                category="position"
                label={t("hr.employees.detail.position")}
                hint="Label legacy (diselaraskan otomatis saat jabatan organisasi dipilih)."
                value={position}
                onChange={setPosition}
                options={positionOptions}
                onOptionsChange={reloadHrOptions}
                canManage={canManageHrOptions && !isSelfProfile}
                placeholder={t("hr.employees.detail.positionPlaceholder")}
                labels={{ ...hrManageLabels, addNew: t("hr.employees.detail.addNewPosition") }}
              />
            </>
          )}

          <HrManageableSelectField
            category="department"
            label={t("hr.employees.detail.department")}
            hint={t("hr.employees.detail.departmentHint")}
            value={department}
            onChange={setDepartment}
            options={departmentOptions}
            onOptionsChange={reloadHrOptions}
            canManage={canManageHrOptions && !isSelfProfile}
            placeholder={t("hr.employees.detail.departmentPlaceholder")}
            labels={{ ...hrManageLabels, addNew: t("hr.employees.detail.addNewDepartment") }}
          />

          {managerIsDerived || orgPositionId ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Atasan langsung</label>
              <input
                readOnly
                value={derivedSuperiorLabel}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              />
              <p className="mt-1 text-xs text-slate-500">
                Diturunkan dari jabatan induk (bukan pilihan manual HR). Kelola di Pengaturan → Struktur Organisasi.
              </p>
            </div>
          ) : (
            <HrManagerPickerField
              label="Atasan langsung (legacy)"
              hint="Hanya jika belum di-link ke jabatan organisasi. Prefer Pengaturan → Struktur Organisasi."
              value={managerUserId}
              onChange={setManagerUserId}
              excludeUserId={user?.id}
              allowAssign={canAssignManager && !isSelfProfile}
              disabled={!canUpdateEmployee || isSelfProfile}
            />
          )}

          <Input label={t("hr.employees.detail.phone")} value={phone} onChange={setPhone} />
          <Input label={t("hr.employees.detail.address")} value={address} onChange={setAddress} />
          <HrManageableSelectField
            category="division"
            label={t("hr.employees.detail.division")}
            hint={t("hr.employees.detail.divisionHint")}
            value={division}
            onChange={setDivision}
            options={divisionOptions}
            onOptionsChange={reloadHrOptions}
            canManage={canManageHrOptions}
            placeholder={t("hr.employees.detail.divisionPlaceholder")}
            optional
            labels={{ ...hrManageLabels, addNew: t("hr.employees.detail.addNewDivision") }}
          />

          {canViewSensitive ? (
            <>
          <SalaryInput
            label={t("hr.employees.detail.salary")}
            digits={salaryDigits}
            onDigitsChange={setSalaryDigits}
          />
          <Input
            label={t("hr.employees.detail.leaveQuota")}
            hint={t("hr.employees.detail.leaveQuotaHint", { default: String(getMaxBookingsPerMonth()) })}
            type="number"
            value={leaveBookingsQuota}
            onChange={setLeaveBookingsQuota}
            placeholder=""
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.leaveDailyRate")}
            hint={t("hr.employees.detail.leaveDailyRateHint")}
            digits={leaveDailyRate}
            onDigitsChange={setLeaveDailyRate}
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.extraBonus")}
            hint={t("hr.employees.detail.extraBonusHint")}
            digits={extraBonusAmount}
            onDigitsChange={setExtraBonusAmount}
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
          />
          <IntegerDigitsInput
            label={t("hr.employees.detail.absenceDeduction")}
            hint={t("hr.employees.detail.absenceDeductionHint")}
            digits={absenceDeductionPerDay}
            onDigitsChange={setAbsenceDeductionPerDay}
          />
          <Input label={t("hr.employees.detail.nik")} value={nik} onChange={setNik} />
          <Input label={t("hr.employees.detail.npwp")} value={npwp} onChange={setNpwp} />
            </>
          ) : (
            <Input
              label={t("hr.employees.detail.leaveQuota")}
              hint={t("hr.employees.detail.leaveQuotaHint", { default: String(getMaxBookingsPerMonth()) })}
              type="number"
              value={leaveBookingsQuota}
              onChange={setLeaveBookingsQuota}
              placeholder=""
            />
          )}

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
                        if (!lateToleranceInput.trim()) {
                          setLateToleranceInput("");
                          return;
                        }
                        const n = parseInt(lateToleranceInput, 10);
                        const c = Number.isNaN(n) ? 0 : Math.min(999, Math.max(0, n));
                        setLateToleranceInput(c > 0 ? String(c) : "");
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

          {/* office moved to top of HR section */}

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
            disabled={saving || !officeId || !canUpdateEmployee}
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
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
  /** true = teks placeholder abu saat belum ada pilihan */
  placeholderTone?: boolean;
  disabled?: boolean;
}) {
  const empty = placeholderTone !== false && value === "";
  return (
    <div className="relative mt-1 min-w-0">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${FORM_CONTROL} appearance-none overflow-x-auto text-left pr-10 ${empty ? "text-slate-400" : "text-slate-800"} ${
          disabled ? "cursor-not-allowed bg-slate-100 text-slate-500" : ""
        }`}
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
