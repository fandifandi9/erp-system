"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { HrManageableSelectField } from "@/components/hr/HrManageableSelectField";
import { HrEntitySelectField } from "@/components/hr/HrEntitySelectField";
import {
  fetchAllHrEmployeeOptions,
  type EmployeeSelectOption,
  type HrOptionCategory,
} from "@/lib/hr-employee-options";
import { getMaxBookingsPerMonth } from "@/lib/leave";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { coerceBrowserTimeToHm, formalizeTimeHmInput } from "@/lib/time-hm-input";
import { useLocale } from "@/components/LocaleProvider";
import { canAccessEmployeeCreate } from "@/lib/capabilities/web-access";
import {
  HR_DEPARTMENT_LABELS_EN,
  HR_DIVISION_LABELS_EN,
  localizeHrOptionLabel,
} from "@/lib/i18n/hr-employee-option-labels-en";
import { ShareFeedbackToast, type ShareToastState } from "@/components/bisnis/ShareFeedbackToast";

type OfficeItem = { id: string; name?: string };

type RecruitablePosition = {
  id: string;
  name: string;
  companyId: string;
  label: string;
  breadcrumb: string[];
  department: string;
  division: string;
  superiorUserId: string | null;
  superiorName: string | null;
  parentVacant: boolean;
  parentName: string | null;
  holderCount?: number;
  appointmentEligible?: boolean;
};

const FORM_CONTROL =
  "w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500";

export function HrEmployeeOnboardForm() {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ShareToastState>(null);
  const [offices, setOffices] = useState<OfficeItem[]>([]);
  const [hrOptions, setHrOptions] = useState<Record<HrOptionCategory, EmployeeSelectOption[]>>({
    position: [],
    department: [],
    division: [],
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dashboardAccess, setDashboardAccess] = useState(true);

  const [officeId, setOfficeId] = useState("");
  const [department, setDepartment] = useState("");
  const [division, setDivision] = useState("");
  const [salaryDigits, setSalaryDigits] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nik, setNik] = useState("");
  const [npwp, setNpwp] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [leaveBookingsQuota, setLeaveBookingsQuota] = useState("");
  const [leaveDailyRate, setLeaveDailyRate] = useState("");
  const [extraBonusAmount, setExtraBonusAmount] = useState("");
  const [extraBonusEnabled, setExtraBonusEnabled] = useState(false);
  const [lateDeductionPerMinute, setLateDeductionPerMinute] = useState("");
  const [absenceDeductionPerDay, setAbsenceDeductionPerDay] = useState("");
  const [lateToleranceInput, setLateToleranceInput] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [shiftStartSaturday, setShiftStartSaturday] = useState("");
  const [shiftEndSaturday, setShiftEndSaturday] = useState("");
  const [shiftStartSunday, setShiftStartSunday] = useState("");
  const [shiftEndSunday, setShiftEndSunday] = useState("");
  const [requireCheckinSelfie, setRequireCheckinSelfie] = useState(false);
  const [primaryEntityId, setPrimaryEntityId] = useState("");

  const [orgPositionId, setOrgPositionId] = useState("");
  const [recruitable, setRecruitable] = useState<RecruitablePosition[]>([]);
  const [recruitableLoading, setRecruitableLoading] = useState(false);
  const [modeConfigured, setModeConfigured] = useState(true);
  const [canExpandStructure, setCanExpandStructure] = useState(false);
  /** 0 = wajib (akun/kerja/org), 1–3 = opsional (pribadi / gaji / kehadiran) */
  const [wizardStep, setWizardStep] = useState(0);

  const selectedPosition = useMemo(
    () => recruitable.find((p) => p.id === orgPositionId) ?? null,
    [recruitable, orgPositionId],
  );

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

  const loadRecruitable = useCallback(async (companyId: string) => {
    setRecruitableLoading(true);
    try {
      const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const res = await fetch(`/api/hr/org-positions/recruitable${qs}`, {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        items?: RecruitablePosition[];
        modeConfigured?: boolean;
        canExpandStructure?: boolean;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setRecruitable([]);
        setModeConfigured(json.modeConfigured !== false);
        setCanExpandStructure(false);
        return;
      }
      setModeConfigured(json.modeConfigured !== false);
      setCanExpandStructure(Boolean(json.canExpandStructure));
      setRecruitable(Array.isArray(json.items) ? json.items : []);
    } catch {
      setRecruitable([]);
      setCanExpandStructure(false);
    } finally {
      setRecruitableLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = pb.authStore.model;
    if (!canAccessEmployeeCreate(user as Record<string, unknown> | null)) {
      router.replace("/hr/employees");
      return;
    }
    setChecking(false);
    void reloadHrOptions();
    void pb.collection("offices").getFullList({ filter: "is_active=true", sort: "name" }).then((rows) => {
      setOffices(rows as unknown as OfficeItem[]);
    });
    // Staff module HR: resolve single working entity when picker not yet set.
    void (async () => {
      try {
        const res = await fetch("/api/hr/auth-context", {
          credentials: "include",
          headers: hrApiAuthHeaders(),
        });
        const json = (await res.json()) as { ok?: boolean; companyIds?: string[] };
        if (!res.ok || !json.ok || !Array.isArray(json.companyIds)) return;
        setPrimaryEntityId((prev) => {
          if (prev) return prev;
          if (json.companyIds!.length === 1) return json.companyIds![0]!;
          return prev;
        });
      } catch {
        /* ignore */
      }
    })();
  }, [router, reloadHrOptions]);

  useEffect(() => {
    void loadRecruitable(primaryEntityId);
    setOrgPositionId("");
  }, [primaryEntityId, loadRecruitable]);

  useEffect(() => {
    if (!selectedPosition) return;
    if (selectedPosition.department && !department) {
      setDepartment(selectedPosition.department);
    }
    if (selectedPosition.division && !division) {
      setDivision(selectedPosition.division);
    }
  }, [selectedPosition, department, division]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      setError(t("hr.employees.new.errEmailPassword"));
      return;
    }
    if (!primaryEntityId) {
      setError("Pilih entitas administratif terlebih dahulu.");
      return;
    }
    if (!orgPositionId) {
      setError("Pilih jabatan / posisi dari Struktur Organisasi.");
      return;
    }
    if (!officeId) {
      setError(t("hr.employees.detail.errOfficeRequired"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/hr/employees", {
        method: "POST",
        headers: hrApiAuthHeaders(),
        body: JSON.stringify({
          name,
          email: emailTrim,
          password,
          role_preset_id: "staff",
          dashboard_access: dashboardAccess,
          office_id: officeId,
          org_position_id: orgPositionId,
          department,
          division,
          salary_digits: salaryDigits,
          phone,
          address,
          nik,
          npwp,
          employee_code: employeeCode,
          join_date: joinDate,
          leave_bookings_quota: leaveBookingsQuota,
          leave_daily_rate: leaveDailyRate,
          extra_bonus_amount: extraBonusAmount,
          extra_bonus_enabled: extraBonusEnabled,
          late_deduction_per_minute: lateDeductionPerMinute,
          absence_deduction_per_day: absenceDeductionPerDay,
          late_tolerance: lateToleranceInput,
          shift_start: formalizeTimeHmInput(shiftStart) || "",
          shift_end: formalizeTimeHmInput(shiftEnd) || "",
          shift_start_saturday: formalizeTimeHmInput(shiftStartSaturday) || "",
          shift_end_saturday: formalizeTimeHmInput(shiftEndSaturday) || "",
          shift_start_sunday: formalizeTimeHmInput(shiftStartSunday) || "",
          shift_end_sunday: formalizeTimeHmInput(shiftEndSunday) || "",
          require_checkin_selfie: requireCheckinSelfie,
          primary_entity_id: primaryEntityId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("hr.employees.new.createFailed"));

      setToast({
        kind: "success",
        title: json.data?.appointmentPending
          ? "Karyawan dibuat. Pengangkatan menunggu persetujuan atasan di Meja Kerja."
          : t("hr.employees.new.createdInactive"),
      });
      const userId = json.data?.userId as string | undefined;
      setTimeout(() => {
        router.push(userId ? `/hr/employees/${userId}` : "/hr/employees");
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("hr.employees.new.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return <div className="p-6 text-slate-500">{t("hr.employees.new.checkingAccess")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <ShareFeedbackToast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        <h1 className="text-2xl font-semibold text-slate-800">{t("hr.employees.new.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Jabatan diambil dari Struktur Organisasi (posisi target recruitment). Bukan daftar role
          statis.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t("hr.employees.new.inactiveNotice")}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} autoComplete="off" className="space-y-5">
        {wizardStep === 0 ? (
          <>
        {/* SECTION 1 — AKUN + SECTION 2/3 — KERJA & ORGANISASI */}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800">1. Akun</h2>
            <Field label={t("hr.employees.new.name")} value={name} onChange={setName} name="serba-hr-new-name" />
            <Field
              label={t("hr.employees.new.email")}
              value={email}
              onChange={setEmail}
              name="serba-hr-new-email"
              inputMode="email"
            />
            <Field
              label={t("hr.employees.new.password")}
              type="password"
              value={password}
              onChange={setPassword}
              name="serba-hr-new-password"
              autoComplete="new-password"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={dashboardAccess}
                onChange={(e) => setDashboardAccess(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t("hr.employees.new.dashboardAccessHint")}
            </label>
          </section>

          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800">2. Data kerja</h2>
            <HrEntitySelectField
              value={primaryEntityId}
              onChange={setPrimaryEntityId}
              allowView
              allowAssign
            />
            <div>
              <label className="text-sm text-slate-600">{t("hr.employees.detail.office")}</label>
              <select
                className={`mt-1 ${FORM_CONTROL} ${!officeId ? "text-slate-400" : ""}`}
                value={officeId}
                onChange={(e) => setOfficeId(e.target.value)}
                required
              >
                <option value="" disabled hidden />
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || o.id}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label={t("hr.employees.detail.employeeCode")}
              value={employeeCode}
              onChange={setEmployeeCode}
            />
            <div>
              <label className="text-sm text-slate-600">{t("hr.employees.detail.joinDate")}</label>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className={`mt-1 ${FORM_CONTROL}`}
              />
            </div>
          </section>
        </div>

        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800">3. Organisasi</h2>
            {canExpandStructure ? (
              <Link
                href="/pengaturan/organisasi"
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Kelola Struktur Organisasi →
              </Link>
            ) : (
              <span className="text-[11px] text-slate-500">
                Posisi baru dibuat oleh atasan / Owner di Struktur Organisasi
              </span>
            )}
          </div>

          {!modeConfigured ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Struktur Organisasi belum dikonfigurasi. Owner harus menentukan mode dan membuat
              posisi terlebih dahulu.
            </p>
          ) : null}

          <div>
            <label className="text-sm text-slate-600">Jabatan / Posisi *</label>
            <select
              className={`mt-1 ${FORM_CONTROL} ${!orgPositionId ? "text-slate-400" : ""}`}
              value={orgPositionId}
              onChange={(e) => setOrgPositionId(e.target.value)}
              required
              disabled={recruitableLoading || !primaryEntityId}
            >
              <option value="">
                {!primaryEntityId
                  ? "Pilih entitas dulu…"
                  : recruitableLoading
                    ? "Memuat posisi…"
                    : recruitable.length === 0
                      ? "Tidak ada posisi aktif untuk entitas ini"
                      : "— Pilih posisi target —"}
              </option>
              {recruitable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.appointmentEligible === false ? " · (butuh approval atasan)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Target recruitment administratif — semua posisi aktif di entitas. Pengangkatan
              (appointment) hanya jika Anda punya otoritas hierarki.
              {canExpandStructure
                ? " Buat posisi baru lewat Struktur Organisasi (Tambah bawahan)."
                : " Staff tidak dapat menambah struktur — minta Manager/atasan atau Owner."}
            </p>
            {selectedPosition && selectedPosition.appointmentEligible === false ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Anda dapat merekrut ke posisi ini, tetapi belum berwenang mengangkat. Karyawan
                akan dibuat dengan target jabatan; assignment aktif menunggu atasan/Owner.
              </p>
            ) : null}
          </div>

          {selectedPosition ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Posisi berada di bawah
              </p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-800">
                {selectedPosition.breadcrumb
                  .map((name, i) => `${"  ".repeat(i)}${i > 0 ? "└─ " : ""}${name}`)
                  .join("\n")}
              </pre>
              <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
                <span className="text-slate-400">Atasan (turunan): </span>
                {selectedPosition.parentVacant
                  ? "Atasan belum tersedia karena posisi induk kosong"
                  : selectedPosition.superiorName
                    ? `${selectedPosition.parentName || "Induk"} — ${selectedPosition.superiorName}`
                    : selectedPosition.parentName
                      ? `${selectedPosition.parentName} (pemegang belum ada)`
                      : "Akar — tanpa atasan jabatan"}
                {typeof selectedPosition.holderCount === "number" ? (
                  <span className="ml-2 text-slate-400">
                    · {selectedPosition.holderCount} pemegang aktif
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <HrManageableSelectField
              category="department"
              label={t("hr.employees.detail.department")}
              value={department}
              onChange={setDepartment}
              options={departmentOptions}
              onOptionsChange={reloadHrOptions}
              canManage
              optional
              labels={{ ...hrManageLabels, addNew: t("hr.employees.detail.addNewDepartment") }}
            />
            <HrManageableSelectField
              category="division"
              label={t("hr.employees.detail.division")}
              value={division}
              onChange={setDivision}
              options={divisionOptions}
              onOptionsChange={reloadHrOptions}
              canManage
              optional
              labels={{ ...hrManageLabels, addNew: t("hr.employees.detail.addNewDivision") }}
            />
          </div>
        </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Data pribadi, penggajian &amp; kehadiran opsional — 3 langkah berikutnya, bisa dilewati.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWizardStep(1)}
                disabled={!orgPositionId}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                Berikutnya →
              </button>
              <button
                type="submit"
                disabled={loading || !orgPositionId}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? t("hr.common.saving") : "Lewati & buat user"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/hr/employees")}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
          </>
        ) : null}

        {wizardStep >= 1 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">
                Data tambahan {wizardStep}/3
                <span className="ml-2 font-normal text-slate-400">(opsional)</span>
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className={`h-2 w-8 rounded-full ${
                      n === wizardStep ? "bg-sky-600" : n < wizardStep ? "bg-sky-300" : "bg-slate-200"
                    }`}
                  />
                ))}
              </div>
            </div>

            {wizardStep === 1 ? (
              <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800">4. Data pribadi</h2>
                <Field label={t("hr.employees.detail.phone")} value={phone} onChange={setPhone} />
                <Field label={t("hr.employees.detail.address")} value={address} onChange={setAddress} />
                <Field label={t("hr.employees.detail.nik")} value={nik} onChange={setNik} />
                <Field label={t("hr.employees.detail.npwp")} value={npwp} onChange={setNpwp} />
              </section>
            ) : null}

            {wizardStep === 2 ? (
              <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800">5. Penggajian</h2>
                <SalaryField
                  label={t("hr.employees.detail.salary")}
                  digits={salaryDigits}
                  onChange={setSalaryDigits}
                />
                <Field
                  label={t("hr.employees.detail.leaveQuota")}
                  hint={t("hr.employees.detail.leaveQuotaHint", {
                    default: String(getMaxBookingsPerMonth()),
                  })}
                  value={leaveBookingsQuota}
                  onChange={setLeaveBookingsQuota}
                  type="number"
                />
                <MoneyField
                  label={t("hr.employees.detail.leaveDailyRate")}
                  hint={t("hr.employees.detail.leaveDailyRateHint")}
                  digits={leaveDailyRate}
                  onChange={setLeaveDailyRate}
                />
                <MoneyField
                  label={t("hr.employees.detail.extraBonus")}
                  hint={t("hr.employees.detail.extraBonusHint")}
                  digits={extraBonusAmount}
                  onChange={setExtraBonusAmount}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={extraBonusEnabled}
                    onChange={(e) => setExtraBonusEnabled(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  {t("hr.employees.detail.extraBonusEnabled")}
                </label>
                <MoneyField
                  label={t("hr.employees.detail.lateDeduction")}
                  hint={t("hr.employees.detail.lateDeductionHint")}
                  digits={lateDeductionPerMinute}
                  onChange={setLateDeductionPerMinute}
                />
                <MoneyField
                  label={t("hr.employees.detail.absenceDeduction")}
                  hint={t("hr.employees.detail.absenceDeductionHint")}
                  digits={absenceDeductionPerDay}
                  onChange={setAbsenceDeductionPerDay}
                />
                <Field
                  label={t("hr.employees.detail.lateTolerance")}
                  value={lateToleranceInput}
                  onChange={setLateToleranceInput}
                  type="number"
                />
              </section>
            ) : null}

            {wizardStep === 3 ? (
              <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-800">6. Kehadiran</h2>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                  <TimeField
                    label={t("hr.employees.detail.clockIn")}
                    value={shiftStart}
                    onChange={setShiftStart}
                  />
                  <TimeField
                    label={t("hr.employees.detail.clockOut")}
                    value={shiftEnd}
                    onChange={setShiftEnd}
                  />
                </div>
                <p className="text-xs text-slate-500">{t("hr.employees.detail.saturdayOptional")}</p>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                  <TimeField
                    label={t("hr.employees.detail.saturdayIn")}
                    value={shiftStartSaturday}
                    onChange={setShiftStartSaturday}
                  />
                  <TimeField
                    label={t("hr.employees.detail.saturdayOut")}
                    value={shiftEndSaturday}
                    onChange={setShiftEndSaturday}
                  />
                </div>
                <p className="text-xs text-slate-500">{t("hr.employees.detail.sundayOptional")}</p>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                  <TimeField
                    label={t("hr.employees.detail.sundayIn")}
                    value={shiftStartSunday}
                    onChange={setShiftStartSunday}
                  />
                  <TimeField
                    label={t("hr.employees.detail.sundayOut")}
                    value={shiftEndSunday}
                    onChange={setShiftEndSunday}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={requireCheckinSelfie}
                    onChange={(e) => setRequireCheckinSelfie(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  {t("hr.employees.detail.selfieTitle")}
                </label>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                ← Kembali
              </button>
              {wizardStep < 3 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => s + 1)}
                    className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-100"
                  >
                    Berikutnya →
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => s + 1)}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Lewati
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !orgPositionId}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? t("hr.common.saving") : "Lewati semua & buat"}
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !orgPositionId}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:flex-none sm:px-8"
                >
                  {loading ? t("hr.common.saving") : t("hr.employees.new.createUser")}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  name,
  inputMode,
  autoComplete,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  name?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="text-sm text-slate-600">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        name={name}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className={`mt-1 ${FORM_CONTROL}`}
      />
    </div>
  );
}

function SalaryField({
  label,
  digits,
  onChange,
}: {
  label: string;
  digits: string;
  onChange: (v: string) => void;
}) {
  const display = digits ? formatIntegerId(parseIntegerInput(digits)) : "";
  return (
    <div>
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className={`mt-1 ${FORM_CONTROL}`}
      />
    </div>
  );
}

function MoneyField({
  label,
  hint,
  digits,
  onChange,
}: {
  label: string;
  hint?: string;
  digits: string;
  onChange: (v: string) => void;
}) {
  const display = digits ? formatIntegerId(parseIntegerInput(digits)) : "";
  return (
    <div>
      <label className="text-sm text-slate-600">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className={`mt-1 ${FORM_CONTROL}`}
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm text-slate-600">{label}</label>
      <input
        type="time"
        step={60}
        value={value}
        onChange={(e) => onChange(coerceBrowserTimeToHm(e.target.value))}
        onBlur={() => onChange(formalizeTimeHmInput(value) || "")}
        className={`mt-1 font-mono ${FORM_CONTROL}`}
      />
    </div>
  );
}
