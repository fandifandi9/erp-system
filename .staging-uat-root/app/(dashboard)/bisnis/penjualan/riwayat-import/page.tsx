"use client";

import Link from "next/link";
import { ArrowLeft, Upload, History } from "lucide-react";
import { ImportActivityPanel } from "@/components/bisnis/ImportActivityPanel";

export default function RiwayatImportMassalPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href="/bisnis/penjualan"
          className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Penjualan
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <History className="h-4 w-4" />
              Import massal
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Riwayat Import Massal</h1>
            <p className="mt-1 text-sm text-slate-600">
              Semua batch penjualan marketplace & pelunasan dari Excel — status, progress, dan detail
              posting.
            </p>
          </div>
          <Link
            href="/bisnis/penjualan/import"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Upload className="h-4 w-4" /> Import baru
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <ImportActivityPanel />
        </div>
      </div>
    </div>
  );
}
