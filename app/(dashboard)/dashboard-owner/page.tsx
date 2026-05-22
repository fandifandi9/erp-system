"use client";

import Link from "next/link";
import { MissedCheckoutReminderBanner } from "@/components/MissedCheckoutReminderBanner";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-slate-800">Owner Dashboard</h1>

      <MissedCheckoutReminderBanner />
      <p className="text-slate-600">
        Ringkasan modul sedang disiapkan. Check-in absensi pegawai hanya lewat <strong className="text-slate-800">app native</strong>; di web gunakan menu{" "}
        <strong className="text-slate-800">nama Anda</strong> untuk{" "}
        <Link href="/profile" className="font-medium text-indigo-600 underline-offset-2 hover:underline">
          Profil
        </Link>
        .
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">HR &amp; kehadiran</h2>
        <p className="mt-2 text-sm text-slate-600">
          Aturan <strong className="text-slate-800">selfie wajib saat check-in</strong> per pegawai: buka{" "}
          <strong className="text-slate-800">Kelola Karyawan</strong>, pilih orang, lalu centang{" "}
          <em>Wajibkan foto selfie saat check-in</em> di formulir detail (field PocketBase{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">require_checkin_selfie</code>
          ). Foto tersimpan di <code className="rounded bg-slate-100 px-1 text-xs">attendance_logs.check_in_selfie</code>{" "}
          dan bisa dicek di monitoring absensi.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/hr"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Dashboard HR
          </Link>
          <Link
            href="/hr/employees"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Kelola karyawan
          </Link>
          <Link
            href="/hr/attendance"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Monitoring absensi
          </Link>
        </div>
      </div>
    </div>
  );
}
