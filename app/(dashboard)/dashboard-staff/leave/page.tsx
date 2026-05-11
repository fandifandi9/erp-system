"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StaffLeaveBookingPanel } from "./BookingPanel";
import { StaffLeaveHistoryPanel } from "./HistoryPanel";

const BASE_PATH = "/dashboard-staff/leave";

function StaffLeaveModuleShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "request";

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
    <div className="min-h-[70vh]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-6 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cuti</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pengajuan lewat kalender dan riwayat status HR — satu halaman.
            </p>
          </div>
          <nav
            className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/90"
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

      <div className="mx-auto max-w-5xl px-6">
        {tab === "request" ? (
          <StaffLeaveBookingPanel omitPageHeader />
        ) : (
          <StaffLeaveHistoryPanel omitPageHeader />
        )}
      </div>
    </div>
  );
}

export default function StaffLeavePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <StaffLeaveModuleShell />
    </Suspense>
  );
}
