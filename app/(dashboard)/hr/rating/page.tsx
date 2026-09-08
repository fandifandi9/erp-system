"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import { translateRatingApiError, translateRatingLabel } from "@/lib/hr/rating-ui";

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
  const { t } = useLocale();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/dashboard", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(translateRatingApiError(json.error, t, "hr.rating.dashboard.loadError"));
        return;
      }
      setData(json.data);
    })();
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("hr.rating.dashboard.title")}</h1>
        <p className="text-sm text-slate-600">{t("hr.rating.dashboard.subtitle")}</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label={t("hr.rating.dashboard.periodActive")}
          value={data?.period?.name || "—"}
          hint={data?.period?.status ? translateRatingLabel(t, "status", data.period.status) : undefined}
          helper={t("hr.rating.dashboard.periodActiveHelp")}
        />
        <Card
          label={t("hr.rating.dashboard.totalAssignments")}
          value={String(data?.total_assignments ?? "—")}
          helper={t("hr.rating.dashboard.totalAssignmentsHelp")}
        />
        <Card
          label={t("hr.rating.dashboard.completed")}
          value={`${data?.completed ?? 0} / ${data?.total_assignments ?? 0}`}
          helper={t("hr.rating.dashboard.completedHelp")}
        />
        <Card
          label={t("hr.rating.dashboard.inProgress")}
          value={String(data?.in_progress ?? 0)}
          helper={t("hr.rating.dashboard.inProgressHelp")}
        />
        <Card
          label={t("hr.rating.dashboard.avgScore")}
          value={data?.average_score == null ? "—" : String(data.average_score)}
          helper={t("hr.rating.dashboard.avgScoreHelp")}
        />
        <Card
          label={t("hr.rating.dashboard.attention")}
          value={String(data?.attention_count ?? 0)}
          helper={t("hr.rating.dashboard.attentionHelp")}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="rounded bg-slate-900 px-4 py-2 font-medium text-white" href="/hr/rating/assignments">
          {t("hr.rating.dashboard.createAssignment")}
        </Link>
        <Link className="rounded border px-4 py-2" href="/hr/rating/periods">
          {t("hr.rating.dashboard.managePeriods")}
        </Link>
        <Link className="rounded border px-4 py-2" href="/hr/rating/results">
          {t("hr.rating.dashboard.viewResults")}
        </Link>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  hint,
  helper,
}: {
  label: string;
  value: string;
  hint?: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      <p className="mt-2 text-xs text-slate-500">{helper}</p>
    </div>
  );
}
