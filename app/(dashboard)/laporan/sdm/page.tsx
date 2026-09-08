"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  UserCheck,
  Clock,
  CalendarDays,
  Banknote,
  AlertTriangle,
  Briefcase,
  Loader2,
  Users,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";
import { ReportingModuleNav } from "@/components/hr/ReportingModuleNav";
import { isHrAccount, type AuthUserShape } from "@/lib/rbac";

export default function LaporanSdmPage() {
  const { t } = useLocale();
  const [user, setUser] = useState<AuthUserShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    employees: 0,
    present: 0,
    late: 0,
    onLeave: 0,
    suspicious: 0,
    pendingLeave: 0,
  });

  const reports = useMemo(
    () => [
      { href: "/hr/attendance", label: t("laporan.sdm.reportAttendance"), desc: t("laporan.sdm.reportAttendanceDesc"), icon: Clock, color: "bg-indigo-50 text-indigo-600" },
      { href: "/hr/attendance/suspicious", label: t("laporan.sdm.reportSuspicious"), desc: t("laporan.sdm.reportSuspiciousDesc"), icon: AlertTriangle, color: "bg-amber-50 text-amber-600" },
      { href: "/hr/leave", label: t("laporan.sdm.reportLeave"), desc: t("laporan.sdm.reportLeaveDesc"), icon: CalendarDays, color: "bg-emerald-50 text-emerald-600" },
      { href: "/hr/overtime", label: t("laporan.sdm.reportOvertime"), desc: t("laporan.sdm.reportOvertimeDesc"), icon: Clock, color: "bg-violet-50 text-violet-600" },
      { href: "/hr/payroll", label: t("laporan.sdm.reportPayroll"), desc: t("laporan.sdm.reportPayrollDesc"), icon: Banknote, color: "bg-cyan-50 text-cyan-600" },
      { href: "/hr/field-activity", label: t("laporan.sdm.reportField"), desc: t("laporan.sdm.reportFieldDesc"), icon: Briefcase, color: "bg-blue-50 text-blue-600" },
      { href: "/hr/employees", label: t("laporan.sdm.reportEmployees"), desc: t("laporan.sdm.reportEmployeesDesc"), icon: UserCheck, color: "bg-slate-100 text-slate-700" },
    ],
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const todayStr = now.toISOString().split("T")[0];

      const [presentRes, lateRes, suspiciousRes, leaveRes, pendingLeaveRes, usersRes] =
        await Promise.all([
          pb.collection("attendance_logs").getList(1, 1, {
            filter: `status="present" && created >= "${start.toISOString()}" && created <= "${end.toISOString()}"`,
            requestKey: null,
          }),
          pb.collection("attendance_logs").getList(1, 1, {
            filter: `status="late" && created >= "${start.toISOString()}" && created <= "${end.toISOString()}"`,
            requestKey: null,
          }),
          pb.collection("attendance_logs").getList(1, 1, {
            filter: "is_suspicious=true",
            requestKey: null,
          }),
          pb.collection("leave_requests").getList(1, 1, {
            filter: `status="approved" && date="${todayStr}"`,
            requestKey: null,
          }),
          pb.collection("leave_requests").getList(1, 1, {
            filter: 'status="pending"',
            requestKey: null,
          }),
          pb.collection("users").getList(1, 1, { requestKey: null }),
        ]);

      setStats({
        employees: usersRes.totalItems,
        present: presentRes.totalItems,
        late: lateRes.totalItems,
        onLeave: leaveRes.totalItems,
        suspicious: suspiciousRes.totalItems,
        pendingLeave: pendingLeaveRes.totalItems,
      });
    } catch (err) {
      console.error("Laporan SDM stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sync = () => setUser((pb.authStore.model as AuthUserShape | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const hr = isHrAccount(user);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReportingModuleNav />
      <div>
        {hr ? null : (
          <Link href="/laporan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
            <ArrowLeft className="h-4 w-4" />
            {t("laporan.common.back")}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-slate-900">{t(hr ? "laporan.sdm.titleHr" : "laporan.sdm.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t(hr ? "laporan.sdm.subtitleHr" : "laporan.sdm.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {t("laporan.sdm.statEmployees")}
            </div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{stats.employees}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">{t("laporan.sdm.statPresent")}</p>
            <p className="text-2xl font-bold text-emerald-900">{stats.present}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">{t("laporan.sdm.statLate")}</p>
            <p className="text-2xl font-bold text-amber-900">{stats.late}</p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-xs text-violet-700">{t("laporan.sdm.statOnLeave")}</p>
            <p className="text-2xl font-bold text-violet-900">{stats.onLeave}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-700">{t("laporan.sdm.statSuspicious")}</p>
            <p className="text-2xl font-bold text-red-900">{stats.suspicious}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{t("laporan.sdm.statPendingLeave")}</p>
            <p className="text-2xl font-bold text-slate-900">{stats.pendingLeave}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.color}`}>
                <r.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">{r.label}</p>
                <p className="text-xs text-slate-500">{r.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
