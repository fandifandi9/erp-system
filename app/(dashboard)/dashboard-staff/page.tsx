"use client";

import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import {
  Banknote,
  Calendar,
  MapPin,
  Moon,
  Navigation,
} from "lucide-react";

export default function StaffPage() {
  const user = pb.authStore.model;
  const showStaffMenu = user && canAccess(user, "/dashboard-staff");

  const cardClass =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md";

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Staff Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Modul cuti, lembur, slip gaji, dan aktivitas luar kantor. Absensi (check-in/out) hanya di <strong className="text-slate-700">app native</strong>; profil dari menu pojok kanan atas.
        </p>
      </div>

      {showStaffMenu ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/dashboard-staff/leave" className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-100 p-2.5">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Cuti</p>
                <p className="mt-1 text-sm text-slate-600">Pengajuan dan riwayat cuti</p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard-staff/overtime" className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5">
                <Moon className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Lembur</p>
                <p className="mt-1 text-sm text-slate-600">Penunjukan & pengajuan lembur</p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard-staff/payroll" className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-100 p-2.5">
                <Banknote className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Slip gaji</p>
                <p className="mt-1 text-sm text-slate-600">
                  Ringkasan gaji per periode setelah HR menyetujui pembayaran
                </p>
              </div>
            </div>
          </Link>

          <Link href="/dashboard-staff/field-activity" className={cardClass}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-teal-100 p-2.5">
                <Navigation className="h-5 w-5 text-teal-700" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Aktivitas luar kantor</p>
                <p className="mt-1 text-sm text-slate-600">
                  Meeting, kunjungan, dinas — ACC HR sebelum check-in di luar zona
                </p>
              </div>
            </div>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          <p className="flex items-center gap-2 font-medium text-slate-800">
            <MapPin className="h-4 w-4" />
            Akses dashboard staff terbatas
          </p>
          <p className="mt-2">
            Check-in/out dari <strong className="text-slate-800">app mobile SERBA</strong>. Profil: menu{" "}
            <strong className="text-slate-800">nama Anda</strong> lalu{" "}
            <Link href="/profile" className="font-medium text-indigo-600 underline-offset-2 hover:underline">
              Profil
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
