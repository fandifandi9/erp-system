"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";

type Row = {
  id: string;
  date: string;
  check_in?: string;
  check_out?: string;
  status?: string;
  late_minutes?: number;
  overtime_minutes?: number;
};

export default function DashboardStaffAttendanceHistoryPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const token = pb.authStore.token;
        const res = await fetch("/api/hr/attendance/history?perPage=30", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat riwayat.");
        setItems(json.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat.");
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Riwayat absensi</h1>
        <Link href="/dashboard-staff/attendance" className="text-sm font-medium text-indigo-600">
          Kembali ke absensi hari ini
        </Link>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {items.length === 0 ? (
          <li className="p-4 text-sm text-slate-500">Belum ada data.</li>
        ) : (
          items.map((r) => (
            <li key={r.id} className="p-4 text-sm">
              <p className="font-medium text-slate-900">{r.date}</p>
              <p className="text-slate-600">
                {r.check_in ? new Date(r.check_in).toLocaleTimeString("id-ID") : "—"}
                {" → "}
                {r.check_out ? new Date(r.check_out).toLocaleTimeString("id-ID") : "belum pulang"}
              </p>
              <p className="text-xs text-slate-500">
                {r.status}
                {r.late_minutes ? ` · telat ${r.late_minutes} m` : ""}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
