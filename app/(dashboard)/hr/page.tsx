"use client";

import { pb } from "@/lib/pocketbase";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  AlertTriangle,
  Calendar,
  MapPin,
  Moon,
  Navigation,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { HrRatingShortcutCard } from "@/components/hr/HrRatingShortcutCard";
import { MissedCheckoutReminderBanner } from "@/components/MissedCheckoutReminderBanner";
import { useLocale } from "@/components/LocaleProvider";
import { StaffDeskWorkbench } from "@/components/workspace/StaffDeskWorkbench";
import { WorkspaceHeader } from "@/components/ui/workspace-header";
import type { ComponentType } from "react";

/**
 * Phase NEXT-FIX — True HR Full Desktop dashboard.
 * ERP density: KPI + Meja Kerja + operational shortcuts. Not a personal staff home.
 */
export default function HRPage() {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    todayPresent: 0,
    todayLate: 0,
    onLeave: 0,
    suspicious: 0,
    totalOffices: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const dateLocale = locale === "en" ? "en-US" : "id-ID";
  const user = pb.authStore.model as Record<string, unknown> | null;
  const displayName =
    String(user?.name ?? "").trim() ||
    String(user?.email ?? "").split("@")[0] ||
    "HR";

  useEffect(() => {
    void loadStats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadStats();
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      const [presentResult, lateResult, suspiciousResult, leaveResult, officesResult, usersResult] =
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
            filter: `status="approved" && date="${now.toISOString().split("T")[0]}"`,
            requestKey: null,
          }),
          pb.collection("offices").getList(1, 1, { requestKey: null }),
          pb.collection("users").getList(1, 1, { requestKey: null }),
        ]);

      setStats({
        totalEmployees: usersResult.totalItems,
        todayPresent: presentResult.totalItems,
        todayLate: lateResult.totalItems,
        onLeave: leaveResult.totalItems,
        suspicious: suspiciousResult.totalItems,
        totalOffices: officesResult.totalItems,
      });
    } catch (error) {
      console.error("Load stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  const deskLinkClass = (href: string) => {
    void href;
    return "flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-amber-300 hover:bg-amber-50";
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <WorkspaceHeader
        title="HR / SDM"
        subtitle={`Workspace operasional · Selamat datang, ${displayName}`}
      />
      <p className="text-xs text-slate-400">
        {t("hr.dashboard.lastUpdate", { time: lastUpdate.toLocaleTimeString(dateLocale) })}
      </p>

      <MissedCheckoutReminderBanner />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard href="/hr/employees" label={t("hr.dashboard.statEmployees")} value={stats.totalEmployees} tone="indigo" icon={Users} />
        <KpiCard href="/hr/attendance" label={t("hr.dashboard.statPresent")} value={stats.todayPresent} tone="green" icon={Clock} />
        <KpiCard href="/hr/attendance" label={t("hr.dashboard.statLate")} value={stats.todayLate} tone="yellow" icon={AlertTriangle} />
        <KpiCard href="/hr/leave" label={t("hr.dashboard.statOnLeave")} value={stats.onLeave} tone="blue" icon={Calendar} />
        <KpiCard href="/hr/attendance/suspicious" label={t("hr.dashboard.statSuspicious")} value={stats.suspicious} tone="red" icon={AlertTriangle} />
        <KpiCard href="/hr/offices" label={t("hr.dashboard.statOffices")} value={stats.totalOffices} tone="purple" icon={MapPin} />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
              Meja Kerja
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Antrean yang membutuhkan tindakan — badge dari API scoped, bukan angka kosong palsu.
          </p>
          <div className="rounded-lg bg-slate-50 p-2">
            <StaffDeskWorkbench linkClass={deskLinkClass} />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            {t("hr.dashboard.quickActions")}
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <ActionLink href="/hr/employees" label={t("hr.dashboard.manageEmployees")} className="bg-indigo-600 hover:bg-indigo-700" />
            <ActionLink href="/hr/attendance" label={t("hr.dashboard.viewAttendance")} className="bg-green-600 hover:bg-green-700" />
            <ActionLink href="/hr/leave" label={t("hr.dashboard.manageLeave")} className="bg-blue-600 hover:bg-blue-700" />
            <ActionLink href="/hr/overtime" label={t("hr.dashboard.overtime")} className="bg-amber-600 hover:bg-amber-700" icon={Moon} />
            <ActionLink href="/hr/field-activity" label={t("hr.dashboard.fieldActivity")} className="bg-teal-600 hover:bg-teal-700" icon={Navigation} />
            <ActionLink href="/hr/recruitment-approvals" label="Rekrutmen" className="bg-violet-600 hover:bg-violet-700" />
            <ActionLink href="/hr/reports" label={t("hr.reporting.reportsTitle")} className="bg-indigo-700 hover:bg-indigo-800" />
            <ActionLink href="/hr/findings" label={t("hr.reporting.findingsTitle")} className="bg-rose-700 hover:bg-rose-800" />
            <ActionLink href="/hr/org-structure" label="Organisasi" className="bg-slate-700 hover:bg-slate-800" />
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" />
            Attendance operasional: <Link href="/hr/attendance" className="font-medium text-indigo-600 underline">/hr/attendance</Link>
            {" · "}
            Absensi saya: <Link href="/dashboard-staff/attendance" className="font-medium text-indigo-600 underline">Personal</Link>
          </div>
        </section>
      </div>

      <HrRatingShortcutCard />
    </div>
  );
}

function KpiCard({
  href,
  label,
  value,
  tone,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: number;
  tone: "indigo" | "green" | "yellow" | "blue" | "red" | "purple";
  icon: LucideIcon | ComponentType<{ className?: string }>;
}) {
  const tones: Record<string, string> = {
    indigo: "border-slate-200 bg-white",
    green: "border-green-200 bg-green-50",
    yellow: "border-yellow-200 bg-yellow-50",
    blue: "border-blue-200 bg-blue-50",
    red: "border-red-200 bg-red-50",
    purple: "border-purple-200 bg-purple-50",
  };
  return (
    <Link href={href} className={`rounded-xl border p-4 transition hover:shadow-md ${tones[tone]}`}>
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
    </Link>
  );
}

function ActionLink({
  href,
  label,
  className,
  icon: Icon,
}: {
  href: string;
  label: string;
  className: string;
  icon?: LucideIcon | ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white transition ${className}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </Link>
  );
}
