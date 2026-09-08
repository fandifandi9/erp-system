"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

export default function HrRatingAssignmentDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const res = await fetch(`/api/hr/rating/assignments/${id}`, { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal load");
        return;
      }
      setData(json);
    })();
  }, [id]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">Memuat…</div>;

  const assignment = data.assignment as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | null;
  const progress = (data.progress || {}) as Record<string, unknown>;
  const reviewers =
    (data.reviewers as Array<{ reviewer_row: Record<string, unknown>; scores: unknown[] }>) || [];
  const expandSub = (assignment.expand as { subject?: { name?: string; email?: string }; created_by?: { name?: string; email?: string } } | undefined);

  return (
    <div className="space-y-6">
      <Link href="/hr/rating/assignments" className="text-sm text-indigo-700 underline">
        ← Assignment
      </Link>
      <h1 className="text-2xl font-semibold">
        Detail: {expandSub?.subject?.name || expandSub?.subject?.email || String(assignment.subject)}
      </h1>
      <div className="grid gap-3 sm:grid-cols-2 rounded border bg-white p-4 text-sm">
        <p>Requested: {String(progress.requested ?? assignment.reviewer_count)}</p>
        <p>Eligible: {String(progress.eligible ?? "—")}</p>
        <p>Selected: {String(progress.selected ?? reviewers.length)}</p>
        <p>Completed: {String(progress.completed_label ?? "—")}</p>
        <p>Respondents: {String(progress.respondents_label ?? "—")}</p>
        <p>Status: {String(progress.status_label || assignment.status)}</p>
        <p>Method: {String(assignment.assignment_method)}</p>
        <p>Created by: {expandSub?.created_by?.name || expandSub?.created_by?.email || "—"}</p>
      </div>

      {result && (
        <div className="rounded border bg-white p-4 text-sm space-y-1">
          <h2 className="font-semibold">Hasil agregat</h2>
          <p>
            Score: {String(result.overall_score)} — {String(result.category)}
          </p>
          <p>
            Respondents: {String(progress.respondents_label || result.respondent_count)}
            {String(progress.aggregate_kind) === "current" ? " (current aggregate)" : ""}
            {String(progress.aggregate_kind) === "final" ? " (final)" : ""}
          </p>
          <p>{String(result.summary)}</p>
          <p>Suggestion: {String(result.suggestions)}</p>
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
                {expand?.reviewer?.name || expand?.reviewer?.email || String(rev.reviewer)} — tier:{" "}
                {String(rev.relevance_tier || "-")} — {String(rev.status)}
              </p>
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
