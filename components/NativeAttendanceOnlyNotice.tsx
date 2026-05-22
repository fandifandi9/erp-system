"use client";

import Link from "next/link";
import { Smartphone } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { getDefaultRouteForUser } from "@/lib/rbac";

/** Web ERP tidak menyediakan check-in/out; arahkan ke aplikasi mobile. */
export function NativeAttendanceOnlyNotice() {
  const home = getDefaultRouteForUser(pb.authStore.model as Record<string, unknown> | null);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/90 p-5 shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
          <Smartphone className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 space-y-2 text-sm text-slate-800">
          <p className="font-semibold text-slate-900">Absensi hanya di aplikasi mobile</p>
          <p className="leading-relaxed text-slate-700">
            Check-in, check-out, dan riwayat kehadiran dilakukan lewat <strong>aplikasi mobile SERBA</strong>. Web
            ERP hanya untuk dashboard kerja (cuti, lembur, slip gaji, dll.) setelah Anda check-in dari HP.
          </p>
        </div>
      </div>
      <Link
        href={home}
        className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        Buka dashboard kerja
      </Link>
    </div>
  );
}
