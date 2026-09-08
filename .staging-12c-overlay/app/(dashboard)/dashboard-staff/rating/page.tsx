"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import { translateAspectName, translateRatingApiError, translateRatingLabel } from "@/lib/hr/rating-ui";

export default function StaffRatingResultPage() {
  const { t } = useLocale();
  const [data, setData] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/my-result", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(translateRatingApiError(json.error, t, "hr.rating.myResult.loadError"));
        return;
      }
      setData(json.data ?? null);
    })();
  }, [t]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (data === undefined) return <div className="p-6 text-slate-500">{t("common.loading")}</div>;
  if (!data || !data.result) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Link href="/dashboard-staff" className="text-sm text-indigo-700 underline">
          ← {t("hr.rating.nav.dashboard")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("hr.rating.myResult.title")}</h1>
        <p className="text-slate-600">{t("hr.rating.myResult.empty")}</p>
        <p className="text-sm text-slate-500">{t("hr.rating.myResult.emptyHelp")}</p>
      </div>
    );
  }

  const result = data.result as Record<string, unknown>;
  const progress = (data.progress || {}) as Record<string, unknown>;
  const aspects = (result.aspect_scores as Array<Record<string, unknown>>) || [];

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <Link href="/dashboard-staff" className="text-sm text-indigo-700 underline">
        ← {t("hr.rating.nav.dashboard")}
      </Link>
      <h1 className="text-2xl font-semibold">{t("hr.rating.myResult.title")}</h1>
      <div className="rounded border bg-white p-4">
        <p className="text-3xl font-bold">{String(result.overall_score)}</p>
        <p className="text-lg text-slate-700">{translateRatingLabel(t, "category", String(result.category))}</p>
        <p className="mt-1 text-sm text-slate-500">
          {t("hr.rating.results.colRespondents")}:{" "}
          {String(result.respondents_label || progress.respondents_label || result.respondent_count)}
        </p>
      </div>
      <div className="rounded border bg-white p-4 text-sm space-y-2">
        <h2 className="font-semibold">{t("hr.rating.assignments.summaryHeading")}</h2>
        <p>
          <strong>{t("hr.rating.myResult.summary")}:</strong> {String(result.summary)}
        </p>
        <p>
          <strong>{t("hr.rating.myResult.suggestion")}:</strong> {String(result.suggestions)}
        </p>
      </div>
      <div className="rounded border bg-white p-4 text-sm">
        <h2 className="font-semibold mb-2">{t("hr.rating.myResult.perAspect")}</h2>
        <ul className="space-y-1">
          {aspects.map((a) => (
            <li key={String(a.aspectId)}>
              {translateAspectName(t, String(a.aspectCode || ""), String(a.aspectName || ""))}: {String(a.average)}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-400">{t("hr.rating.myResult.privacy")}</p>
    </div>
  );
}
