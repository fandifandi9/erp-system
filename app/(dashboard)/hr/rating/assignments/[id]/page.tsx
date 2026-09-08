"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import {
  progressHelperText,
  translateAspectName,
  translateRatingApiError,
  translateRatingLabel,
  translateRatingMethod,
} from "@/lib/hr/rating-ui";

export default function HrRatingAssignmentDetailPage() {
  const { t } = useLocale();
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
        setError(translateRatingApiError(json.error, t, "hr.rating.errors.notFound"));
        return;
      }
      setData(json);
    })();
  }, [id, t]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return <div className="text-slate-500">{t("common.loading")}</div>;

  const assignment = data.assignment as Record<string, unknown>;
  const result = data.result as Record<string, unknown> | null;
  const progress = (data.progress || {}) as Record<string, unknown>;
  const reviewers =
    (data.reviewers as Array<{ reviewer_row: Record<string, unknown>; scores: unknown[] }>) || [];
  const expandSub = assignment.expand as
    | { subject?: { name?: string; email?: string }; created_by?: { name?: string; email?: string } }
    | undefined;
  const completed = Number(progress.completed || 0);
  const selected = Number(progress.selected || reviewers.length || 0);
  const aspectScores = ((result?.aspect_scores as Array<Record<string, unknown>>) || []);

  return (
    <div className="space-y-6">
      <Link href="/hr/rating/assignments" className="text-sm text-indigo-700 underline">
        ← {t("hr.rating.assignments.back")}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t("hr.rating.assignments.detailTitle")}:{" "}
        {expandSub?.subject?.name || expandSub?.subject?.email || String(assignment.subject)}
      </h1>
      <div className="grid gap-3 sm:grid-cols-2 rounded border bg-white p-4 text-sm">
        <p>
          {t("hr.rating.assignments.requested")}: {String(progress.requested ?? assignment.reviewer_count)}
        </p>
        <p>
          {t("hr.rating.assignments.eligible")}: {String(progress.eligible ?? "—")}
        </p>
        <p>
          {t("hr.rating.assignments.selected")}: {String(progress.selected ?? reviewers.length)}
        </p>
        <p>
          {t("hr.rating.assignments.colCompleted")}: {String(progress.completed_label ?? "—")}
        </p>
        <p>
          {t("hr.rating.results.colRespondents")}: {String(progress.respondents_label ?? "—")}
        </p>
        <p className="sm:col-span-2 text-xs text-slate-500">{progressHelperText(t, completed, selected)}</p>
        <p className="sm:col-span-2 text-xs text-slate-500">{t("hr.rating.assignments.respondentsHelp")}</p>
        <p>
          {t("hr.rating.assignments.colStatus")}: {translateRatingLabel(t, "status", String(progress.status_label || assignment.status))}
        </p>
        <p>
          {t("hr.rating.assignments.method")}: {translateRatingMethod(t, String(assignment.assignment_method))}
        </p>
        <p>
          {t("hr.rating.assignments.createdBy")}: {expandSub?.created_by?.name || expandSub?.created_by?.email || "—"}
        </p>
      </div>

      {result && (
        <div className="rounded border bg-white p-4 text-sm space-y-2">
          <h2 className="font-semibold">{t("hr.rating.assignments.summaryHeading")}</h2>
          <p className="text-slate-500">{t("hr.rating.assignments.summaryHelp")}</p>
          <p>
            {t("hr.rating.assignments.score")}: {String(result.overall_score)} —{" "}
            {translateRatingLabel(t, "category", String(result.category))}
          </p>
          <p>
            {t("hr.rating.results.colRespondents")}: {String(progress.respondents_label || result.respondent_count)}
            {String(progress.aggregate_kind) === "current" ? ` (${t("hr.rating.myResult.currentAggregate")})` : ""}
            {String(progress.aggregate_kind) === "final" ? ` (${t("hr.rating.myResult.finalAggregate")})` : ""}
          </p>
          <p>
            {t("hr.rating.myResult.summary")}: {String(result.summary)}
          </p>
          <p>
            {t("hr.rating.myResult.suggestion")}: {String(result.suggestions)}
          </p>
          {aspectScores.length > 0 && (
            <ul className="mt-2 space-y-1">
              {aspectScores.map((a) => (
                <li key={String(a.aspectId || a.aspectCode)}>
                  {translateAspectName(t, String(a.aspectCode || ""), String(a.aspectName || ""))}: {String(a.average)}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">{t("hr.rating.assignments.scaleTitle")}</p>
          <ul className="text-xs text-slate-500">
            {["1", "2", "3", "4", "5"].map((n) => (
              <li key={n}>{t(`hr.rating.scale.${n}`)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="font-semibold">{t("hr.rating.assignments.reviewersHeading")}</h2>
        {reviewers.map((r) => {
          const rev = r.reviewer_row;
          const expand = rev.expand as { reviewer?: { name?: string; email?: string } } | undefined;
          return (
            <div key={String(rev.id)} className="rounded border bg-white p-4 text-sm">
              <p className="font-medium">
                {expand?.reviewer?.name || expand?.reviewer?.email || String(rev.reviewer)} — {t("hr.rating.assignments.tier")}:{" "}
                {translateRatingLabel(t, "tier", String(rev.relevance_tier || "-"))} —{" "}
                {translateRatingLabel(t, "status", String(rev.status))}
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
