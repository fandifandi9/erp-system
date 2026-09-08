"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Dash = {
  period?: { id: string; name?: string; status?: string } | null;
  total_subjects: number;
  total_assignments: number;
  completed: number;
  in_progress: number;
  average_score: number | null;
  attention_count: number;
};

export default function HrRatingDashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/dashboard", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal memuat dasbor");
        return;
      }
      setData(json.data);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Penilaian / Rating</h1>
        <p className="text-sm text-slate-600">Modul resmi SDM. Satu subject → banyak reviewer.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Periode aktif" value={data?.period?.name || "—"} hint={data?.period?.status} />
        <Card label="Total assignment" value={String(data?.total_assignments ?? "—")} />
        <Card
          label="Selesai"
          value={`${data?.completed ?? 0} / ${data?.total_assignments ?? 0}`}
        />
        <Card label="Belum selesai" value={String(data?.in_progress ?? 0)} />
        <Card label="Rata-rata skor" value={data?.average_score == null ? "—" : String(data.average_score)} />
        <Card label="Perlu perhatian HR" value={String(data?.attention_count ?? 0)} />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="rounded bg-slate-900 px-4 py-2 font-medium text-white" href="/hr/rating/assignments">
          Buat assignment
        </Link>
        <Link className="rounded border px-4 py-2" href="/hr/rating/periods">
          Kelola periode
        </Link>
        <Link className="rounded border px-4 py-2" href="/hr/rating/results">
          Lihat hasil
        </Link>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
