"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, Loader2 } from "lucide-react";
import { holidayTypeLabel, type HolidayDto } from "@/lib/hr/hr-policy-types";

export default function StaffHolidaysPage() {
  const [items, setItems] = useState<HolidayDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const year = new Date().getFullYear();
    try {
      const res = await fetch(`/api/hr/holidays/published?from=${year}-01-01&to=${year + 1}-12-31`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: HolidayDto[]; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal memuat hari libur.");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat hari libur.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/dashboard-staff" className="mb-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Kembali ke dasbor
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <CalendarDays className="h-7 w-7 text-blue-600" />
          Kalender & Hari Libur
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hari libur nasional, perusahaan, dan cuti bersama yang berlaku untuk entitas administratif Anda.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Belum ada hari libur yang dipublikasikan.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((h) => (
            <li key={h.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{h.name}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{formatDateId(h.date)}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800">
                  {holidayTypeLabel(h.holiday_type)}
                </span>
              </div>
              {h.description ? <p className="mt-2 text-sm text-slate-600">{h.description}</p> : null}
              {h.company_name ? (
                <p className="mt-2 text-xs text-slate-400">Entitas: {h.company_name}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDateId(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return ymd;
  return dt.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
