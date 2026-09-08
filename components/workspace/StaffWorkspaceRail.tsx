"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Calendar,
  Clock,
  Moon,
  User,
  type LucideIcon,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import { useLocale } from "@/components/LocaleProvider";
import { createTranslator } from "@/lib/i18n";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { getLeaveHistory, formatDateRange } from "@/lib/leave";
import { fetchOvertimeForUser, OVERTIME_STATUS_LABEL, type OvertimeRequest } from "@/lib/overtime";
import { staffWorkspaceConfig } from "@/lib/workspace/workspaces/staff";
import { filterQuickActionsForUser } from "@/lib/workspace/resolve-workspace";
import {
  Card,
  CardHeader,
  EmptyState,
  LoadingState,
  SectionHeader,
  StatusBadge,
} from "@/components/ui";

import {
  formatScheduleTimeRange,
  parseTodayAttendanceResponse,
  type TodayAttendanceClientPayload,
} from "@/lib/hr/attendance-today-client";

type TodayPayload = TodayAttendanceClientPayload;

type AgendaItem = {
  id: string;
  kind: "leave" | "overtime";
  label: string;
  sub: string;
  tone: "neutral" | "warning" | "success" | "info";
  href: string;
};

const QUICK_ACTION_IDS = ["profile", "leave", "attendance", "payroll", "overtime"] as const;

const QUICK_ICONS: Record<string, LucideIcon> = {
  profile: User,
  leave: Calendar,
  attendance: Clock,
  payroll: Banknote,
  overtime: Moon,
};

function formatHm(iso: string | undefined, locale: "id" | "en"): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(locale === "en" ? "en-US" : "id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayYmdLocal(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function isFutureOrTodayYmd(ymd: string): boolean {
  return ymd >= todayYmdLocal();
}

function attendanceStatusLabel(
  today: TodayPayload | null,
  t: ReturnType<typeof import("@/lib/i18n").createTranslator>,
): { label: string; tone: "neutral" | "warning" | "success" | "info" } {
  const record = today?.data;
  if (!record?.check_in) {
    return { label: t("workspace.staff.rail.notCheckedIn"), tone: "warning" };
  }
  if (record.check_in && !record.check_out) {
    return { label: t("workspace.staff.rail.working"), tone: "info" };
  }
  if (record.check_in && record.check_out) {
    return { label: t("workspace.staff.rail.done"), tone: "success" };
  }
  return { label: t("workspace.staff.rail.notCheckedIn"), tone: "neutral" };
}

export function StaffWorkspaceRail() {
  const { t, locale } = useLocale();
  const user = pb.authStore.model as Record<string, unknown> | null;
  const userId = String(user?.id ?? "");

  const [today, setToday] = useState<TodayPayload | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const res = await fetch("/api/hr/attendance/today", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error);
      setToday(parseTodayAttendanceResponse(json));
    } catch {
      setToday(null);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const loadAgenda = useCallback(async () => {
    if (!userId) {
      setAgenda([]);
      setAgendaLoading(false);
      return;
    }
    setAgendaLoading(true);
    const tr = createTranslator(locale);
    try {
      const [leaveResult, overtimeRows] = await Promise.all([
        getLeaveHistory(userId, 1, 20),
        fetchOvertimeForUser(userId),
      ]);

      const items: AgendaItem[] = [];

      for (const lv of leaveResult.items) {
        if (!isFutureOrTodayYmd(lv.end_date) && lv.status !== "pending") continue;
        if (lv.status !== "approved" && lv.status !== "pending") continue;
        items.push({
          id: `leave-${lv.id}`,
          kind: "leave",
          label:
            lv.status === "pending"
              ? tr("workspace.staff.rail.leavePending")
              : tr("workspace.staff.rail.leaveApproved"),
          sub: formatDateRange(lv.start_date, lv.end_date),
          tone: lv.status === "pending" ? "warning" : "success",
          href: "/dashboard-staff/leave?tab=history",
        });
      }

      for (const ot of overtimeRows) {
        if (!isFutureOrTodayYmd(ot.work_date)) continue;
        if (!["waiting_staff", "waiting_hr", "staff_accepted"].includes(ot.status)) continue;
        items.push({
          id: `ot-${ot.id}`,
          kind: "overtime",
          label: OVERTIME_STATUS_LABEL[ot.status] ?? ot.status,
          sub: `${ot.work_date} · ${ot.start_time}–${ot.end_time}`,
          tone: ot.status === "waiting_staff" ? "warning" : "info",
          href: "/dashboard-staff/overtime",
        });
      }

      items.sort((a, b) => a.sub.localeCompare(b.sub));
      setAgenda(items.slice(0, 5));
    } catch {
      setAgenda([]);
    } finally {
      setAgendaLoading(false);
    }
  }, [userId, locale]);

  useEffect(() => {
    void loadToday();
    void loadAgenda();
  }, [loadToday, loadAgenda]);

  const quickActions = useMemo(() => {
    if (!user) return [];
    const allowed = filterQuickActionsForUser(staffWorkspaceConfig, user);
    return QUICK_ACTION_IDS.map((id) => allowed.find((a) => a.id === id)).filter(
      (a): a is NonNullable<typeof a> => Boolean(a),
    );
  }, [user]);

  const status = attendanceStatusLabel(today, t);
  const scheduleRange = formatScheduleTimeRange(today?.schedule);
  const scheduleLabel = scheduleRange
    ? scheduleRange
    : today?.schedule?.source === "none"
      ? t("workspace.staff.rail.noSchedule")
      : "—";

  const workingDay =
    today?.schedule?.isWorkingDay === false
      ? t("workspace.staff.rail.dayOff")
      : today?.schedule?.isWorkingDay === true
        ? t("workspace.staff.rail.workingDayYes")
        : "—";

  return (
    <div className="space-y-4">
      <Card padding="p-4">
        <CardHeader title={t("workspace.staff.rail.today")} />
        {todayLoading ? (
          <LoadingState label={t("design.loading")} />
        ) : (
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-erp-text-muted">{t("workspace.staff.rail.status")}</dt>
              <dd>
                <StatusBadge label={status.label} tone={status.tone} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-erp-text-muted">{t("workspace.staff.rail.schedule")}</dt>
              <dd className="font-medium text-erp-text">{scheduleLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-erp-text-muted">{t("workspace.staff.rail.workingDay")}</dt>
              <dd className="font-medium text-erp-text">{workingDay}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-erp-text-muted">{t("workspace.staff.rail.checkIn")}</dt>
              <dd className="font-medium text-erp-text">{formatHm(today?.data?.check_in, locale)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-erp-text-muted">{t("workspace.staff.rail.checkOut")}</dt>
              <dd className="font-medium text-erp-text">{formatHm(today?.data?.check_out, locale)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card padding="p-4">
        <CardHeader title={t("workspace.staff.rail.agenda")} />
        {agendaLoading ? (
          <LoadingState label={t("design.loading")} />
        ) : agenda.length === 0 ? (
          <EmptyState
            title={t("workspace.staff.rail.agendaEmpty")}
            description={t("workspace.staff.rail.agendaEmptyDesc")}
            className="py-6"
          />
        ) : (
          <ul className="space-y-2">
            {agenda.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-lg border border-erp-border px-3 py-2 transition hover:bg-erp-surface-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-erp-text">{item.label}</p>
                    <StatusBadge
                      label={item.kind === "leave" ? t("workspace.staff.rail.kindLeave") : t("workspace.staff.rail.kindOvertime")}
                      tone={item.tone}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-erp-text-muted">{item.sub}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {quickActions.length > 0 ? (
        <Card padding="p-4">
          <CardHeader title={t("workspace.staff.rail.quickActions")} />
          <div className="space-y-1.5">
            {quickActions.map((action) => {
              const Icon = QUICK_ICONS[action.id] ?? User;
              if (!canAccess(user!, action.accessPath)) return null;
              return (
                <Link
                  key={action.id}
                  href={action.href}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-erp-text transition hover:bg-erp-surface-muted"
                >
                  <Icon className="h-4 w-4 text-erp-text-muted" aria-hidden />
                  {t(action.titleKey)}
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
