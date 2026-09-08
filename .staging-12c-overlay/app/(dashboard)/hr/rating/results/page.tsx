"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";
import { translateRatingApiError, translateRatingLabel } from "@/lib/hr/rating-ui";

type Row = {
  assignment: {
    id: string;
    status: string;
    expand?: { subject?: { name?: string; email?: string } };
    subject?: string;
  };
  progress?: { respondents_label?: string; status_label?: string; is_complete?: boolean };
  result?: { overall_score?: number; category?: string } | null;
};

export default function HrRatingResultsPage() {
  const { t } = useLocale();
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/results", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(translateRatingApiError(json.error, t, "hr.rating.results.loadError"));
        return;
      }
      setItems(json.items || []);
    })();
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("hr.rating.results.title")}</h1>
        <p className="text-sm text-slate-600">{t("hr.rating.results.subtitle")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("hr.rating.results.respondentsHelp")}</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">{t("hr.rating.results.empty")}</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-3">{t("hr.rating.results.colEmployee")}</th>
              <th className="py-2 pr-3">{t("hr.rating.results.colScore")}</th>
              <th className="py-2 pr-3">{t("hr.rating.results.colCategory")}</th>
              <th className="py-2 pr-3">{t("hr.rating.results.colRespondents")}</th>
              <th className="py-2 pr-3">{t("hr.rating.results.colStatus")}</th>
              <th className="py-2">{t("hr.rating.results.colDetail")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.assignment.id} className="border-b border-slate-100">
                <td className="py-2 pr-3">
                  {row.assignment.expand?.subject?.name ||
                    row.assignment.expand?.subject?.email ||
                    row.assignment.subject}
                </td>
                <td className="py-2 pr-3">{row.result?.overall_score ?? "—"}</td>
                <td className="py-2 pr-3">{translateRatingLabel(t, "category", row.result?.category)}</td>
                <td className="py-2 pr-3">{row.progress?.respondents_label ?? "—"}</td>
                <td className="py-2 pr-3">{translateRatingLabel(t, "status", row.progress?.status_label || row.assignment.status)}</td>
                <td className="py-2">
                  <Link className="text-indigo-700 underline" href={`/hr/rating/assignments/${row.assignment.id}`}>
                    {t("hr.rating.results.colDetail")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
