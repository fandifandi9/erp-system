"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";
import { resolveDeskModulesForUser } from "@/lib/workspace/resolve-workspace";
import type { DeskContextualItem } from "@/lib/workspace/desk-modules";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

type Props = {
  linkClass: (href: string) => string;
  onNavigate?: () => void;
};

type HrDeskSummary = {
  pendingLeave: number;
  suspiciousAttendance: number;
  openFindings: number;
  pendingRecruitmentApprovals: number;
  pendingOvertime?: number;
};

type PendingRecruitment = {
  id: string;
  candidateName: string;
  orgPositionName: string;
};

function badgeForItem(item: DeskContextualItem, summary: HrDeskSummary | null): number | null {
  if (!summary || !item.summaryKey) return null;
  const value = summary[item.summaryKey];
  if (typeof value !== "number") return null;
  return value > 0 ? value : null;
}

/**
 * Meja Kerja = action center only (pending tasks + quick actions).
 * Full workspace menus live in sidebar sections by jabatan/domain — no "Buka … Lengkap".
 */
function shouldShowDeskItem(
  item: DeskContextualItem,
  summary: HrDeskSummary | null,
): boolean {
  if (!item.summaryKey) return true;
  if (!summary) return false;
  const value = summary[item.summaryKey];
  return typeof value === "number" && value > 0;
}

function isWorkflowActionItem(item: DeskContextualItem): boolean {
  return Boolean(item.summaryKey);
}

export function StaffDeskWorkbench({ linkClass, onNavigate }: Props) {
  const { t } = useLocale();
  const user = pb.authStore.model as Record<string, unknown> | null;
  const [hrSummary, setHrSummary] = useState<HrDeskSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [pendingRecruitments, setPendingRecruitments] = useState<PendingRecruitment[]>([]);

  const modules = useMemo(
    () => (user ? resolveDeskModulesForUser(user) : []),
    [user],
  );

  const showHrSummary = modules.some((mod) => mod.id === "hr" && mod.items.length > 0);

  useEffect(() => {
    if (!showHrSummary) {
      setHrSummary(null);
      setSummaryError(null);
      setPendingRecruitments([]);
      return;
    }
    let cancelled = false;
    void fetch("/api/hr/desk-workbench-summary", {
      credentials: "include",
      headers: hrApiAuthHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
          throw new Error(body?.error || body?.message || `Meja Kerja gagal (${res.status})`);
        }
        return (await res.json()) as { data?: HrDeskSummary };
      })
      .then((json) => {
        if (!cancelled) {
          setHrSummary(json?.data ?? null);
          setSummaryError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHrSummary(null);
          setSummaryError(err instanceof Error ? err.message : "Gagal memuat Meja Kerja");
        }
      });

    void fetch("/api/hr/recruitment-requests?pendingForApprover=1", {
      credentials: "include",
      headers: hrApiAuthHeaders(),
    })
      .then(async (res) =>
        res.ok ? ((await res.json()) as { items?: PendingRecruitment[] }) : null,
      )
      .then((json) => {
        if (!cancelled) setPendingRecruitments(Array.isArray(json?.items) ? json!.items! : []);
      })
      .catch(() => {
        if (!cancelled) setPendingRecruitments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showHrSummary]);

  if (!user) return null;

  if (modules.length === 0) {
    return (
      <p className="px-3 py-2.5 text-xs leading-relaxed text-slate-400">
        {t("workspace.staff.desk.empty")}
      </p>
    );
  }

  if (summaryError) {
    return (
      <p className="px-3 py-2.5 text-xs leading-relaxed text-rose-300" role="alert">
        {summaryError}
      </p>
    );
  }

  return (
    <div className="space-y-3 pb-1">
      {pendingRecruitments.length > 0 ? (
        <div className="space-y-2 px-2">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400/90">
            Prioritas / Perlu Tindakan
          </p>
          {pendingRecruitments.slice(0, 5).map((r) => (
            <Link
              key={r.id}
              href="/hr/recruitment-approvals"
              onClick={onNavigate}
              className="block rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left hover:bg-amber-500/20"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                Recruitment Baru
              </p>
              <p className="mt-0.5 text-sm font-medium text-slate-100">
                {r.candidateName || "Kandidat"}
              </p>
              <p className="text-[11px] text-slate-400">
                Target: {r.orgPositionName || "—"}
              </p>
              <p className="mt-1 text-[11px] text-amber-200/90">Menunggu persetujuan Anda</p>
            </Link>
          ))}
        </div>
      ) : null}

      {modules.map((mod) => {
        const summary = mod.id === "hr" ? hrSummary : null;
        const visibleItems = mod.items.filter((item) => shouldShowDeskItem(item, summary));
        const actionItems = visibleItems.filter(isWorkflowActionItem);
        const quickItems = visibleItems.filter((item) => !isWorkflowActionItem(item));

        return (
          <div key={mod.id} className="space-y-2">
            <p className="px-3 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t(mod.titleKey)}
            </p>

            {actionItems.length > 0 ? (
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-medium uppercase tracking-wide text-slate-500/90">
                  {t("workspace.staff.desk.section.priority")}
                </p>
                <ul className="space-y-0.5">
                  {actionItems.map((item) => {
                    const badge = badgeForItem(item, summary);
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={linkClass(item.href)}
                          onClick={onNavigate}
                        >
                          <span className="flex min-w-0 items-start justify-between gap-2">
                            <span className="flex min-w-0 flex-col gap-0.5">
                              <span className="leading-snug">{t(item.titleKey)}</span>
                              {item.descriptionKey ? (
                                <span className="text-[11px] font-normal leading-snug text-slate-400">
                                  {t(item.descriptionKey)}
                                </span>
                              ) : null}
                            </span>
                            {badge != null ? (
                              <span className="mt-0.5 inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-200">
                                {badge}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="px-3 text-[11px] leading-relaxed text-slate-500">
                {t("workspace.staff.desk.section.noTasks")}
              </p>
            )}

            {quickItems.length > 0 ? (
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-medium uppercase tracking-wide text-slate-500/90">
                  Quick action
                </p>
                <ul className="space-y-0.5">
                  {quickItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className={linkClass(item.href)}
                        onClick={onNavigate}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="leading-snug">{t(item.titleKey)}</span>
                          {item.descriptionKey ? (
                            <span className="text-[11px] font-normal leading-snug text-slate-400">
                              {t(item.descriptionKey)}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
