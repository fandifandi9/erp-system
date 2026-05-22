"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, Smartphone } from "lucide-react";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";

function ErpLockedInner() {
  const sp = useSearchParams();
  const next = sp.get("next")?.trim() || "";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/90 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Clock className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard operasional terkunci</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Beberapa area web ERP (di luar menu personal cuti/lembur/slip/luar kantor) hanya aktif setelah{" "}
          <strong>check-in absensi</strong> di <strong>aplikasi mobile</strong>. Modul personal di dashboard staff
          tetap bisa diakses. Owner dan HR tidak dibatasi aturan ini.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-800">
            <Smartphone className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
            Buka app native SERBA untuk check-in / check-out
          </p>
        </div>
        {next && next.startsWith("/") && !next.startsWith("//") ? (
          <p className="mt-4 text-xs text-slate-500">
            Setelah check-in dari HP, coba lagi:{" "}
            <Link href={next} className="font-medium text-indigo-600 underline-offset-2 hover:underline">
              {next}
            </Link>
          </p>
        ) : null}
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
