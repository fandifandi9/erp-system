"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Calendar,
  ClipboardCheck,
  Clock,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import { useLocale } from "@/components/LocaleProvider";
import { createTranslator } from "@/lib/i18n";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { getLeaveHistory } from "@/lib/leave";
import { fetchOvertimeForUser, OVERTIME_STATUS_LABEL } from "@/lib/overtime";
import { fetchStaffBenefitSummary } from "@/lib/employee-benefits";
import { fetchSelfPayslipsApi } from "@/lib/payroll-client";
import { staffWorkspaceConfig } from "@/lib/workspace/workspaces/staff";
import { filterQuickActionsForUser } from "@/lib/workspace/resolve-workspace";
import {
  StaffAttendanceSummaryChart,
  StaffAttendanceTrendChart,
  type AttendanceChartSegment,
  type AttendanceTrendPoint,
} from "@/components/workspace/StaffAttendanceCharts";
import {
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  QuickAction,
  Section,
  StatCard,
} from "@/components/ui";

import { parseTodayAttendanceResponse, type TodayAttendanceClientPayload } from "@/lib/hr/attendance-today-client";

type TodayPayload = TodayAttendanceClientPayload;

type HistoryItem = {
  date?: string;
  status?: string;
  check_in?: string;
};

type ActivityItem = {
  id: string;
  label: string;
  sub: string;
  href?: string;
  tone: "neutral" | "warning" | "success" | "info";
};

type DashboardData = {
  today: TodayPayload | null;
  pendingRequests: number;
  overtimeHoursMonth: number;
  latestPayslipLabel: string | null;
  snapshot: {
    monthLabel: string;
    presentDays: number;
    approvedLeaveDays: number;
    approvedFieldDays: number;
    alphaDays: number;
    requiredWorkDays: number;
    evaluatedThrough: string;
  } | null;
  chartSegments: AttendanceChartSegment[];
  trendSeries: AttendanceTrendPoint[];
  activities: ActivityItem[];
};

const SHORTCUT_IDS = ["leave", "overtime", "attendance", "payroll", "reports"] as const;

const SHORTCUT_ICONS: Record<string, LucideIcon> = {
  leave: Calendar,
  overtime: Moon,
  attendance: Clock,
  payroll: Banknote,
  reports: ClipboardCheck,
};

function greetingKey(hour: number): string {
  if (hour < 11) return "workspace.staff.greeting.morning";
  if (hour < 17) return "workspace.staff.greeting.afternoon";
  return "workspace.staff.greeting.evening";
}

function formatHm(iso: string | undefined, locale: "id" | "en"): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(locale === "en" ? "en-US" : "id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function currentMonthPrefix(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

function attendanceKpi(
  today: TodayPayload | null,
  t: ReturnType<typeof import("@/lib/i18n").createTranslator>,
  locale: "id" | "en",
): { value: string; sub?: string; tone: "neutral" | "warning" | "success" | "info" } {
  if (today?.schedule?.isWorkingDay === false) {
    return { value: t("workspace.staff.dashboard.kpi.dayOff"), tone: "neutral" };
  }
  if (!today?.data?.check_in) {
    return { value: t("workspace.staff.rail.notCheckedIn"), tone: "warning" };
  }
  if (today.data.check_in && !today.data.check_out) {
    return {
      value: t("workspace.staff.rail.working"),
      sub: `${t("workspace.staff.rail.checkIn")} ${formatHm(today.data.check_in, locale)}`,
      tone: "info",
    };
  }
  return {
    value: t("workspace.staff.rail.done"),
    sub: `${formatHm(today.data.check_in, locale)} – ${formatHm(today.data.check_out, locale)}`,
    tone: "success",
  };
}

function buildChartSegments(
  snapshot: NonNullable<DashboardData["snapshot"]>,
  tr: ReturnType<typeof import("@/lib/i18n").createTranslator>,
): AttendanceChartSegment[] {
  const pending = Math.max(
    0,
    snapshot.requiredWorkDays -
      snapshot.presentDays -
      snapshot.approvedLeaveDays -
      snapshot.approvedFieldDays -
      snapshot.alphaDays,
  );

  return [
    {
      key: "present",
      label: tr("workspace.staff.dashboard.summary.present"),
      value: snapshot.presentDays,
      color: "#14b8a6",
    },
    {
      key: "leave",
      label: tr("workspace.staff.dashboard.summary.leave"),
      value: snapshot.approvedLeaveDays,
      color: "#3b82f6",
    },
    {
      key: "sick",
      label: tr("workspace.staff.dashboard.summary.sick"),
      value: 0,
      color: "#eab308",
    },
    {
      key: "alpha",
      label: tr("workspace.staff.dashboard.summary.alpha"),
      value: snapshot.alphaDays,
      color: "#ef4444",
    },
    {
      key: "pending",
      label: tr("workspace.staff.dashboard.summary.pending"),
      value: pending,
      color: "#cbd5e1",
    },
  ];
}

function buildTrendSeries(items: HistoryItem[]): AttendanceTrendPoint[] {
  const sorted = [...items].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  let present = 0;
  let leave = 0;
  let sick = 0;
  let alpha = 0;

  return sorted.map((row) => {
    const st = String(row.status ?? "").toLowerCase();
    if (st === "leave") leave += 1;
    else if (st === "absent") alpha += 1;
    else if (st === "present" || st === "late") present += 1;

    const day = Number.parseInt(String(row.date ?? "").slice(8, 10), 10) || 0;
    return { day, present, leave, sick, alpha };
  });
}

function formatDataAsOf(ymd: string, locale: "id" | "en"): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function StaffDashboardOverview({ displayName }: { displayName: string }) {
  const { t, locale } = useLocale();
  const user = pb.authStore.model as Record<string, unknown> | null;
  const userId = String(user?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData>({
    today: null,
    pendingRequests: 0,
    overtimeHoursMonth: 0,
    latestPayslipLabel: null,
    snapshot: null,
    chartSegments: [],
    trendSeries: [],
    activities: [],
  });

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const monthPrefix = currentMonthPrefix();
    const tr = createTranslator(locale);

    try {
      const [todayRes, leaveResult, overtimeRows, benefitSummary, historyRes, notifRes] =
        await Promise.all([
          fetch("/api/hr/attendance/today", {
            credentials: "include",
            headers: hrApiAuthHeaders(),
          }).then(async (r) => {
            if (!r.ok) return null;
            const json = await r.json();
            return parseTodayAttendanceResponse(json);
          }),
          getLeaveHistory(userId, 1, 30).catch(() => ({
            items: [] as Awaited<ReturnType<typeof getLeaveHistory>>["items"],
          })),
          fetchOvertimeForUser(userId).catch(() => []),
          fetchStaffBenefitSummary(userId).catch(() => null),
          fetch("/api/hr/attendance/history?page=1&perPage=31", {
            credentials: "include",
            headers: hrApiAuthHeaders(),
          }).then(async (r) =>
            r.ok ? ((await r.json()) as { items?: HistoryItem[] }) : { items: [] },
          ),
          fetch("/api/notifications?page=1&perPage=5", { credentials: "include" }).then(async (r) =>
            r.ok
              ? ((await r.json()) as {
                  items?: Array<{ id: string; title: string; body: string; created: string; action?: string }>;
                })
              : { items: [] },
          ),
        ]);

      const authUser = pb.authStore.model as Record<string, unknown> | null;
      let latestPayslipLabel: string | null = null;
      if (authUser && canAccess(authUser, "/dashboard-staff/payroll")) {
        try {
          const slips = await fetchSelfPayslipsApi();
          if (slips[0]?.period_key) latestPayslipLabel = slips[0].period_key;
        } catch {
          latestPayslipLabel = null;
        }
      }

      const pendingLeave = leaveResult.items.filter((lv) => lv.status === "pending").length;
      const pendingOvertime = overtimeRows.filter((ot) =>
        ["waiting_staff", "waiting_hr"].includes(ot.status),
      ).length;

      const overtimeHoursMonth = overtimeRows
        .filter(
          (ot) =>
            ot.work_date.startsWith(monthPrefix) &&
            ["hr_approved", "staff_accepted"].includes(ot.status),
        )
        .reduce((sum, ot) => sum + (Number(ot.hours) || 0), 0);

      const snapshot = benefitSummary?.extraBonus?.snapshot
        ? {
            monthLabel: benefitSummary.extraBonus.snapshot.monthLabel,
            presentDays: benefitSummary.extraBonus.snapshot.presentDays,
            approvedLeaveDays: benefitSummary.extraBonus.snapshot.approvedLeaveDays,
            approvedFieldDays: benefitSummary.extraBonus.snapshot.approvedFieldDays,
            alphaDays: benefitSummary.extraBonus.snapshot.alphaDays,
            requiredWorkDays: benefitSummary.extraBonus.snapshot.requiredWorkDays,
            evaluatedThrough: benefitSummary.extraBonus.snapshot.evaluatedThrough,
          }
        : null;

      const chartSegments = snapshot ? buildChartSegments(snapshot, tr) : [];
      const trendSeries = buildTrendSeries(historyRes.items ?? []);

      const activities: ActivityItem[] = [];

      for (const n of notifRes.items ?? []) {
        activities.push({
          id: `notif-${n.id}`,
          label: n.title,
          sub: n.body,
          href: n.action || undefined,
          tone: "info",
        });
      }

      for (const lv of leaveResult.items.slice(0, 5)) {
        activities.push({
          id: `leave-${lv.id}`,
          label:
            lv.status === "pending"
              ? tr("workspace.staff.rail.leavePending")
              : tr("workspace.staff.dashboard.activity.leave"),
          sub: `${lv.start_date}${lv.end_date !== lv.start_date ? ` – ${lv.end_date}` : ""}`,
          href: "/dashboard-staff/leave?tab=history",
          tone: lv.status === "pending" ? "warning" : "success",
        });
      }

      for (const ot of overtimeRows.slice(0, 3)) {
        activities.push({
          id: `ot-${ot.id}`,
          label: OVERTIME_STATUS_LABEL[ot.status] ?? ot.status,
          sub: `${ot.work_date} · ${ot.start_time}–${ot.end_time}`,
          href: "/dashboard-staff/overtime",
          tone: ot.status === "waiting_staff" ? "warning" : "info",
        });
      }

      if (todayRes?.data?.check_in) {
        activities.unshift({
          id: "check-in-today",
          label: tr("workspace.staff.dashboard.activity.checkIn"),
          sub: formatHm(todayRes.data.check_in, locale),
          href: "/dashboard-staff/attendance",
          tone: "success",
        });
      }

      if (latestPayslipLabel) {
        activities.push({
          id: "payslip-latest",
          label: tr("workspace.staff.dashboard.activity.payslip"),
          sub: latestPayslipLabel,
          href: "/dashboard-staff/payroll",
          tone: "success",
        });
      }

      setData({
        today: todayRes,
        pendingRequests: pendingLeave + pendingOvertime,
        overtimeHoursMonth,
        latestPayslipLabel,
        snapshot,
        chartSegments,
        trendSeries,
        activities: activities.slice(0, 8),
      });
    } catch {
      setData((prev) => ({ ...prev, today: null }));
    } finally {
      setLoading(false);
    }
  }, [userId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return t(greetingKey(hour), { name: displayName });
  }, [t, displayName]);

  const attendance = attendanceKpi(data.today, t, locale);

  const shortcuts = useMemo(() => {
    if (!user) return [];
    const allowed = filterQuickActionsForUser(staffWorkspaceConfig, user);
    return SHORTCUT_IDS.map((id) => allowed.find((a) => a.id === id)).filter(
      (a): a is NonNullable<typeof a> => Boolean(a),
    );
  }, [user]);

  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [locale],
  );

  if (loading) {
    return <LoadingState label={t("design.loading")} className="py-16" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-erp-text">{greeting}</p>
          <p className="mt-0.5 text-xs text-erp-text-muted">{t("workspace.staff.dashboard.subtitle")}</p>
        </div>
        <p className="text-xs font-medium text-erp-text-muted">{dateLabel}</p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("workspace.staff.dashboard.kpi.attendance")}
          value={attendance.value}
          sub={attendance.sub}
          icon={Clock}
          href={canAccess(user!, "/dashboard-staff/attendance") ? "/dashboard-staff/attendance" : undefined}
        />
        <StatCard
          label={t("workspace.staff.dashboard.kpi.activeRequests")}
          value={String(data.pendingRequests)}
          sub={t("workspace.staff.dashboard.kpi.activeRequestsSub")}
          icon={Calendar}
          href={canAccess(user!, "/dashboard-staff/leave") ? "/dashboard-staff/leave" : undefined}
        />
        <StatCard
          label={t("workspace.staff.dashboard.kpi.overtimeMonth")}
          value={`${data.overtimeHoursMonth.toFixed(1)} ${t("workspace.staff.dashboard.kpi.hours")}`}
          sub={t("workspace.staff.dashboard.kpi.overtimeMonthSub")}
          icon={Moon}
          href={canAccess(user!, "/dashboard-staff/overtime") ? "/dashboard-staff/overtime" : undefined}
        />
        <StatCard
          label={t("workspace.staff.dashboard.kpi.payslip")}
          value={
            data.latestPayslipLabel ?? t("workspace.staff.dashboard.kpi.payslipUnavailable")
          }
          sub={
            data.latestPayslipLabel
              ? t("workspace.staff.dashboard.kpi.payslipAvailable")
              : undefined
          }
          icon={Banknote}
          href={canAccess(user!, "/dashboard-staff/payroll") ? "/dashboard-staff/payroll" : undefined}
        />
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Card padding="p-3">
          <CardHeader
            className="mb-2"
            title={
              data.snapshot
                ? `${t("workspace.staff.dashboard.summary.attendance")} (${data.snapshot.monthLabel})`
                : t("workspace.staff.dashboard.summary.attendance")
            }
          />
          {data.snapshot && data.chartSegments.length > 0 ? (
            <StaffAttendanceSummaryChart
              segments={data.chartSegments}
              total={data.snapshot.requiredWorkDays}
              monthLabel={data.snapshot.monthLabel}
              totalDaysLabel={t("workspace.staff.dashboard.summary.totalDays")}
              dataAsOf={t("workspace.staff.dashboard.summary.dataAsOf", {
                date: formatDataAsOf(data.snapshot.evaluatedThrough, locale),
              })}
            />
          ) : (
            <EmptyState
              title={t("workspace.staff.dashboard.summary.emptyTitle")}
              description={t("workspace.staff.dashboard.summary.emptyDesc")}
              className="py-6"
            />
          )}
        </Card>

        <Card padding="p-3">
          <CardHeader
            className="mb-2"
            title={
              data.snapshot
                ? `${t("workspace.staff.dashboard.trend.title")} (${data.snapshot.monthLabel})`
                : t("workspace.staff.dashboard.trend.title")
            }
          />
          {data.trendSeries.length > 0 ? (
            <StaffAttendanceTrendChart
              series={data.trendSeries}
              monthLabel={data.snapshot?.monthLabel ?? ""}
              labels={{
                present: t("workspace.staff.dashboard.trend.present"),
                leave: t("workspace.staff.dashboard.trend.leave"),
                sick: t("workspace.staff.dashboard.trend.sick"),
                alpha: t("workspace.staff.dashboard.trend.alpha"),
              }}
            />
          ) : (
            <EmptyState
              title={t("workspace.staff.dashboard.trend.emptyTitle")}
              description={t("workspace.staff.dashboard.trend.emptyDesc")}
              className="py-6"
            />
          )}
        </Card>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-2">
        <Section title={t("workspace.staff.dashboard.activity.title")} className="space-y-2">
          {data.activities.length > 0 ? (
            <ul className="space-y-2">
              {data.activities.map((item) => {
                const inner = (
                  <div className="rounded-lg border border-erp-border px-3 py-2.5 transition hover:bg-erp-surface-muted">
                    <p className="text-sm font-medium text-erp-text">{item.label}</p>
                    <p className="mt-0.5 text-xs text-erp-text-muted">{item.sub}</p>
                  </div>
                );
                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link href={item.href} className="block transition hover:opacity-90">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title={t("workspace.staff.dashboard.activity.emptyTitle")}
              description={t("workspace.staff.dashboard.activity.emptyDesc")}
              className="py-8"
            />
          )}
        </Section>

        <Section title={t("workspace.staff.dashboard.shortcuts.title")} className="space-y-2">
          {shortcuts.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {shortcuts.map((action) => {
                const Icon = SHORTCUT_ICONS[action.id] ?? Clock;
                const labelKey = `workspace.staff.dashboard.shortcuts.${action.id}` as const;
                const label = t(labelKey);
                return (
                  <QuickAction
                    key={action.id}
                    href={action.href}
                    icon={Icon}
                    label={label === labelKey ? t(action.titleKey) : label}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={t("workspace.staff.dashboard.shortcuts.emptyTitle")}
              description={t("workspace.staff.dashboard.shortcuts.emptyDesc")}
              className="py-8"
            />
          )}
        </Section>
      </div>
    </div>
  );
}
