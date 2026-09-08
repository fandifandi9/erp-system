"use client";

/**
 * Mobile Companion — cerminan aktivitas personal + Meja Kerja.
 * Absensi lewat menu Kehadiran; tidak ada CTA "buka workspace".
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Smartphone,
  ArrowLeft,
  UserRound,
  CheckCircle2,
  CalendarDays,
  Moon,
  Navigation,
  ClipboardList,
  Inbox,
  FileWarning,
  Banknote,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { getDefaultRouteForUser, getOperationalDashboardRoute } from "@/lib/rbac";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { canAccessHrWebModule } from "@/lib/capabilities/web-access";
import { readWebOperationalAccess } from "@/lib/operational-access-gate";

type DeskSummary = {
  pendingLeave: number;
  suspiciousAttendance: number;
  openFindings: number;
  pendingRecruitmentApprovals: number;
  pendingOvertime?: number;
};

type SubmissionRow = {
  id: string;
  kind: string;
  status: string;
  title: string;
  dateLabel: string;
};

function MobileCompanionInner() {
  const [ready, setReady] = useState(false);
  const [desktopHome, setDesktopHome] = useState("/dashboard-staff");
  const [needsCheckIn, setNeedsCheckIn] = useState(false);
  const [summary, setSummary] = useState<DeskSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [subs, setSubs] = useState<SubmissionRow[]>([]);

  useEffect(() => {
    const sync = () => {
      const model = (pb.authStore.model as Record<string, unknown> | null) ?? null;
      const home =
        getOperationalDashboardRoute(model) ||
        getDefaultRouteForUser(model) ||
        "/dashboard-staff";
      setDesktopHome(
        home.startsWith("/mobile") || home.startsWith("/erp-locked")
          ? "/dashboard-staff"
          : home,
      );
      setNeedsCheckIn(Boolean(model) && !readWebOperationalAccess(model));
      setReady(true);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const load = useCallback(async () => {
    if (!pb.authStore.isValid) return;
    try {
      const res = await fetch("/api/hr/my-submissions", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { items?: SubmissionRow[] };
      if (res.ok) setSubs(Array.isArray(json.items) ? json.items.slice(0, 5) : []);
    } catch {
      /* personal list soft */
    }

    const model = (pb.authStore.model as Record<string, unknown> | null) ?? null;
    if (!model || !canAccessHrWebModule(model)) {
      setSummary(null);
      return;
    }
    try {
      const res = await fetch("/api/hr/desk-workbench-summary", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { data?: DeskSummary; error?: string; ok?: boolean };
      if (!res.ok) {
        setSummaryError(json.error || `Meja Kerja gagal (${res.status})`);
        setSummary(null);
        return;
      }
      setSummaryError(null);
      setSummary(json.data ?? null);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Gagal memuat Meja Kerja");
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const personal = [
    { icon: UserRound, label: "Profil Saya", href: "/mobile/profile" },
    { icon: CheckCircle2, label: "Kehadiran / Absensi", href: "/mobile/attendance" },
    { icon: CalendarDays, label: "Cuti", href: "/mobile/leave" },
    { icon: Moon, label: "Lembur", href: "/mobile/overtime" },
    { icon: Navigation, label: "Luar kantor", href: "/mobile/field-activity" },
    { icon: CalendarDays, label: "Off", href: "/mobile/izin-off" },
    { icon: Banknote, label: "Slip Gaji", href: "/mobile/payroll" },
    { icon: Inbox, label: "Pengajuan Saya", href: "/mobile/my-submissions" },
  ];

  const actions: Array<{
    label: string;
    href: string;
    count?: number;
    show: boolean;
  }> = [
    {
      label: "Recruitment Approval",
      href: "/hr/recruitment-approvals",
      count: summary?.pendingRecruitmentApprovals,
      show: Boolean(summary && summary.pendingRecruitmentApprovals > 0),
    },
    {
      label: "Approval Cuti",
      href: "/hr/leave",
      count: summary?.pendingLeave,
      show: Boolean(summary && summary.pendingLeave > 0),
    },
    {
      label: "Approval Lembur",
      href: "/hr/overtime",
      count: summary?.pendingOvertime,
      show: Boolean(summary && (summary.pendingOvertime ?? 0) > 0),
    },
    {
      label: "Koreksi / Absensi mencurigakan",
      href: "/hr/attendance/suspicious",
      count: summary?.suspiciousAttendance,
      show: Boolean(summary && summary.suspiciousAttendance > 0),
    },
    {
      label: "Temuan terbuka",
      href: "/hr/findings",
      count: summary?.openFindings,
      show: Boolean(summary && summary.openFindings > 0),
    },
  ].filter((a) => a.show);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
        <Link
          href={needsCheckIn ? "/erp-locked" : desktopHome}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-sky-300"
        >
          <ArrowLeft className="h-4 w-4" />
          {needsCheckIn ? "Kembali ke peringatan lock" : "Kembali ke Desktop ERP"}
        </Link>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300">
            <Smartphone className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Mobile Companion</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Cerminan app HP di browser: absensi, cuti, lembur, slip gaji, pengajuan, laporan.
            Alternatif jika HP bermasalah.
          </p>
        </div>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Aktivitas personal (seperti di app)
          </p>
          <ul className="space-y-1.5">
            {personal.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm hover:border-sky-500/40"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-sky-400" />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {subs.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Status pengajuan
            </p>
            <ul className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-900/40 p-2">
              {subs.map((s) => (
                <li
                  key={`${s.kind}-${s.id}`}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                >
                  <span className="text-slate-200">
                    {s.title}
                    {s.dateLabel ? (
                      <span className="text-slate-500"> · {s.dateLabel}</span>
                    ) : null}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-amber-300">
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Laporan
          </p>
          <Link
            href="/mobile/reports"
            className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm hover:border-sky-500/40"
          >
            <FileWarning className="h-4 w-4 shrink-0 text-sky-400" />
            <span>Laporan & Temuan</span>
          </Link>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Meja Kerja (action center)
          </p>
          {summaryError ? (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {summaryError}
            </p>
          ) : null}
          {actions.length === 0 && !summaryError ? (
            <p className="rounded-xl border border-slate-800 px-3 py-3 text-sm text-slate-500">
              Tidak ada tugas pending untuk kewenangan Anda saat ini.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {actions.map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm hover:border-amber-400/50"
                  >
                    <span className="flex items-center gap-3">
                      <ClipboardList className="h-4 w-4 shrink-0 text-amber-300" />
                      {item.label}
                    </span>
                    {item.count != null && item.count > 0 ? (
                      <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-200">
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-[11px] text-slate-500">
          Session sama dengan Desktop. App native tetap klien utama di lapangan; halaman ini cadangan
          browser.
        </p>
      </div>
    </div>
  );
}

export default function MobileCompanionEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
          Memuat companion…
        </div>
      }
    >
      <MobileCompanionInner />
    </Suspense>
  );
}
