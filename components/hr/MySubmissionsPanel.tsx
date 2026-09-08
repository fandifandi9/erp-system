"use client";

/**
 * Phase NEXT — unified personal submissions (Desktop + reusable).
 * Data from GET /api/hr/my-submissions (same SSOT as Mobile).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";

export type MySubmissionRow = {
  id: string;
  kind: "leave" | "overtime" | "izin_off" | "field_activity";
  status: string;
  title: string;
  dateLabel: string;
  created?: string;
  rejectionReason?: string;
  approverName?: string;
};

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("approv") || s === "staff_accepted" || s === "hr_approved") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (s.includes("reject") || s.includes("declin") || s === "cancelled") {
    return "bg-rose-100 text-rose-800";
  }
  if (s.includes("pending") || s.includes("waiting")) {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-slate-100 text-slate-700";
}

function kindHref(kind: string): string {
  if (kind === "leave") return "/dashboard-staff/leave";
  if (kind === "overtime") return "/dashboard-staff/overtime";
  if (kind === "field_activity") return "/dashboard-staff/field-activity";
  if (kind === "izin_off") return "/dashboard-staff/izin-off";
  return "/dashboard-staff/my-submissions";
}

type Props = {
  /** Compact for dashboard embed */
  limit?: number;
  showHeaderLink?: boolean;
};

export function MySubmissionsPanel({ limit = 8, showHeaderLink = true }: Props) {
  const [items, setItems] = useState<MySubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/my-submissions", {
        credentials: "include",
        headers: hrApiAuthHeaders(),
      });
      const json = (await res.json()) as { ok?: boolean; items?: MySubmissionRow[]; error?: string };
      if (!res.ok || json.ok === false) {
        setError(json.error || `Gagal memuat pengajuan (${res.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pengajuan");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = limit > 0 ? items.slice(0, limit) : items;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Personal
          </p>
          <h2 className="text-base font-semibold text-slate-900">Pengajuan Saya</h2>
          <p className="text-xs text-slate-500">Cuti · Lembur · Off · Luar kantor — status dari server</p>
        </div>
        {showHeaderLink ? (
          <Link
            href="/dashboard-staff/my-submissions"
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            Lihat semua
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Memuat…</p>
      ) : error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada pengajuan.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                href={kindHref(row.kind)}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50/80"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {row.title}
                    {row.dateLabel ? (
                      <span className="font-normal text-slate-500"> · {row.dateLabel}</span>
                    ) : null}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(row.status)}`}
                >
                  {row.status || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
