"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";

function authHeaders() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

export default function HrRatingAssignmentDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/hr/rating/assignments/${id}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal load");
        return;
      }
      setData(json);
    })();
  }, [id]);

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-slate-500">Memuat…</div>;
  }

  const assignment = data.assignment as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | null;
  const reviewers = (data.reviewers as Array<{ reviewer_row: Record<string, unknown>; scores: unknown[] }>) || [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/hr/rating" className="text-sm text-indigo-700 underline">
        ← Kembali
      </Link>
      <h1 className="text-2xl font-semibold">Detail assignment</h1>
      <div className="rounded border bg-white p-4 text-sm">
        <p>Method: {String(assignment.assignment_method)}</p>
        <p>Status: {String(assignment.status)}</p>
        <p>Reviewer count: {String(assignment.reviewer_count)}</p>
        <pre className="mt-3 max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
          {JSON.stringify(data.selection_evidence, null, 2)}
        </pre>
      </div>

      {result && (
        <div className="rounded border bg-white p-4 text-sm">
          <h2 className="font-semibold">Hasil agregat</h2>
          <p>
            Score: {String(result.overall_score)} — {String(result.category)}
          </p>
          <p>Respondents: {String(result.respondent_count)}</p>
          <p className="mt-2">{String(result.summary)}</p>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="font-semibold">Reviewer (HR/Owner only)</h2>
        {reviewers.map((r) => {
          const rev = r.reviewer_row;
          const expand = rev.expand as { reviewer?: { name?: string; email?: string } } | undefined;
          return (
            <div key={String(rev.id)} className="rounded border bg-white p-4 text-sm">
              <p className="font-medium">
                {expand?.reviewer?.name || expand?.reviewer?.email || String(rev.reviewer)} —{" "}
                {String(rev.status)}
              </p>
              <p className="text-xs text-slate-500">tier: {String(rev.relevance_tier || "-")}</p>
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">
                {JSON.stringify(r.scores, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
