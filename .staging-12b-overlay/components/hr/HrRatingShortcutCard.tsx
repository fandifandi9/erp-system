"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Dash = {
  period?: { name?: string } | null;
  completed?: number;
  total_assignments?: number;
  average_score?: number | null;
  attention_count?: number;
};

export function HrRatingShortcutCard() {
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/dashboard", { headers: ratingAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData(json.data);
    })();
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">HR Rating</h2>
      <p className="text-sm text-slate-600">Ringkasan modul penilaian. Fungsi lengkap ada di /hr/rating.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Periode aktif</dt>
          <dd className="font-medium">{data?.period?.name || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Progress</dt>
          <dd className="font-medium">
            {data?.completed ?? 0} / {data?.total_assignments ?? 0} selesai
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Average</dt>
          <dd className="font-medium">{data?.average_score ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Perlu perhatian</dt>
          <dd className="font-medium">{data?.attention_count ?? 0}</dd>
        </div>
      </dl>
      <Link
        href="/hr/rating"
        className="mt-4 inline-flex rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        Lihat Rating
      </Link>
    </div>
  );
}
