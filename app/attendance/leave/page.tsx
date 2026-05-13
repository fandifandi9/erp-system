"use client";

import { Suspense, useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";
import { StaffLeaveBookingPanel } from "@/app/(dashboard)/dashboard-staff/leave/BookingPanel";
import { StaffLeaveHistoryPanel } from "@/app/(dashboard)/dashboard-staff/leave/HistoryPanel";

const BASE_PATH = "/attendance/leave";

function StandaloneLeaveShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "request";

  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(
    () => (pb.authStore.model as Record<string, unknown> | null) ?? null
  );

  useEffect(() => {
    const sync = () =>
      setSessionUser((pb.authStore.model as Record<string, unknown> | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const headerHomeHref = useMemo(() => {
    if (sessionUser && canAccess(sessionUser, "/profile")) return "/profile";
    if (sessionUser) return getDefaultRouteForUser(sessionUser);
    return "/attendance";
  }, [sessionUser]);

  const goRequest = useCallback(() => {
    router.replace(BASE_PATH);
  }, [router]);

  const goHistory = useCallback(() => {
    router.replace(`${BASE_PATH}?tab=history`);
  }, [router]);

  const tabBtnClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-indigo-600 text-white shadow"
        : "text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <StandaloneAppHeader
        subtitle="Cuti"
        homeHref={headerHomeHref}
        endSlot={<StandalonePortalActions showLogout />}
      />

      <div className="min-h-[60vh]">
        <header className="border-b border-slate-200 bg-white/95 px-4 py-5 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cuti</h1>
              <p className="mt-1 text-sm text-slate-500">
                Pengajuan lewat kalender dan riwayat status HR — sama seperti di dashboard.
              </p>
            </div>
            <nav
              className="flex gap-1 rounded-xl bg-slate-50 p-1 shadow-sm ring-1 ring-slate-200/90"
              aria-label="Bagian cuti"
            >
              <button type="button" className={tabBtnClass(tab === "request")} onClick={goRequest}>
                Pengajuan
              </button>
              <button type="button" className={tabBtnClass(tab === "history")} onClick={goHistory}>
                Riwayat
              </button>
            </nav>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          {tab === "request" ? (
            <StaffLeaveBookingPanel omitPageHeader basePath={BASE_PATH} />
          ) : (
            <StaffLeaveHistoryPanel omitPageHeader basePath={BASE_PATH} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeavePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <StandaloneLeaveShell />
    </Suspense>
  );
}
