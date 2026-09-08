"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Clock, MapPin, Monitor, Smartphone } from "lucide-react";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";
import {
  buildAttendanceUnlockUrl,
  buildMobileUnlockUrl,
} from "@/lib/operational-access-gate";

function ErpLockedInner() {
  const sp = useSearchParams();
  const nextRaw = sp.get("next")?.trim() || "/dashboard-staff";
  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard-staff";
  const mobileHref = buildMobileUnlockUrl(safeNext);
  const attendanceHref = buildAttendanceUnlockUrl(safeNext);

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Clock className="h-7 w-7" aria-hidden />
        </div>
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Bukan error — akses terkunci
        </p>
        <h1 className="text-xl font-bold text-slate-900">Dashboard operasional terkunci</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Modul ERP dibuka setelah <strong>check-in absensi</strong> (GPS di radius kantor). Jika HP
          bermasalah, gunakan <strong>Mobile Companion</strong> di browser — fungsi sama seperti app:
          absensi, cuti, lembur, pengajuan.
        </p>
        <ul className="mt-4 space-y-2 text-left text-sm text-slate-700">
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            Utama: Mobile Companion (cerminan app HP).
          </li>
          <li className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            Aktifkan GPS dan pastikan berada di radius kantor.
          </li>
          <li className="flex gap-2">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            Cadangan: absensi desktop penuh.
          </li>
        </ul>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <Link
            href={mobileHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            Buka Mobile Companion
          </Link>
          <Link
            href={attendanceHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Absensi desktop (cadangan)
          </Link>
          <p className="text-xs text-slate-500">
            Setelah check-in berhasil, Anda diarahkan ke{" "}
            <span className="font-medium text-slate-700">{safeNext}</span>
          </p>
        </div>
      </div>
      <AppVersionWatermark variant="dashboard" />
    </div>
  );
}

export default function ErpLockedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 text-slate-600">Memuat…</div>
      }
    >
      <ErpLockedInner />
    </Suspense>
  );
}
