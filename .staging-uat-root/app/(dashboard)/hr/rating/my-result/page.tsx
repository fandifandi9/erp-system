"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";

function authHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export default function MyRatingResultPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/my-result", { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal load");
        return;
      }
      setData(json.data);
    })();
  }, []);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-slate-500">Memuat…</div>;
  if (!data.result) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Link href="/hr/rating" className="text-sm text-indigo-700 underline">
          ← Rating
        </Link>
        <p className="text-slate-600">Belum ada hasil rating yang tersedia.</p>
      </div>
    );
  }

  const result = data.result as Record<string, unknown>;
  const aspects = (result.aspect_scores as Array<Record<string, unknown>>) || [];

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <Link href="/hr" className="text-sm text-indigo-700 underline">
        ← HR
      </Link>
      <h1 className="text-2xl font-semibold">Hasil rating saya</h1>
      <div className="rounded border bg-white p-4">
        <p className="text-3xl font-bold">{String(result.overall_score)}</p>
        <p className="text-lg text-slate-700">{String(result.category)}</p>
        <p className="mt-1 text-sm text-slate-500">
          Respondents: {String(result.respondent_count)}
        </p>
      </div>
      <div className="rounded border bg-white p-4 text-sm space-y-2">
        <p>
          <strong>Summary:</strong> {String(result.summary)}
        </p>
        <p>
          <strong>Strengths:</strong> {String(result.strengths)}
        </p>
        <p>
          <strong>Improvement:</strong> {String(result.improvements)}
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
      <p className="text-xs text-slate-400">
        Identitas reviewer dan skor individual tidak ditampilkan.
      </p>
    </div>
  );
}
