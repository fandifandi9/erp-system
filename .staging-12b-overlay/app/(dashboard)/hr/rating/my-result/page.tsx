"use client";

import { useEffect, useState } from "react";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

export default function MyRatingResultPage() {
  const [data, setData] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/hr/rating/my-result", { headers: ratingAuthHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Gagal load");
          return;
        }
        setData(json.data ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal load");
      }
    })();
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (data === undefined) return <div className="text-slate-500">Memuat…</div>;

  if (data === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Hasil rating saya</h1>
        <p className="text-slate-600">
          Belum ada assignment rating untuk Anda sebagai subject. Jika Anda HR/admin yang hanya membuat
          penilaian orang lain, ini normal.
        </p>
      </div>
    );
  }

  const result = (data.result || null) as Record<string, unknown> | null;
  const progress = (data.progress || {}) as Record<string, unknown>;
  const aspects = ((result?.aspect_scores as Array<Record<string, unknown>>) || []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Hasil rating saya</h1>
      {!result ? (
        <p className="text-slate-600">Belum ada hasil rating yang tersedia.</p>
      ) : (
        <>
          <div className="rounded border bg-white p-4">
            <p className="text-3xl font-bold">{String(result.overall_score)}</p>
            <p className="text-lg text-slate-700">{String(result.category)}</p>
            <p className="mt-1 text-sm text-slate-500">
              Respondents: {String(result.respondents_label || progress.respondents_label || result.respondent_count)}
            </p>
            <p className="text-xs text-slate-400">
              {String(result.aggregate_kind) === "current"
                ? "Current aggregate (belum semua reviewer selesai)"
                : String(result.aggregate_kind) === "final"
                  ? "Final"
                  : ""}
            </p>
          </div>
          <div className="rounded border bg-white p-4 text-sm space-y-2">
            <p>
              <strong>Summary:</strong> {String(result.summary)}
            </p>
            <p>
              <strong>Suggestion:</strong> {String(result.suggestions)}
            </p>
          </div>
          <div className="rounded border bg-white p-4 text-sm">
            <h2 className="font-semibold mb-2">Per aspek (agregat)</h2>
            <ul className="space-y-1">
              {aspects.map((a) => (
                <li key={String(a.aspectId)}>
                  {String(a.aspectName)}: {String(a.average)}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <p className="text-xs text-slate-400">
        Identitas reviewer, komentar individual, dan skor per reviewer tidak ditampilkan.
      </p>
    </div>
  );
}
