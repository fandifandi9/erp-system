"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Dash = {
  period?: { name?: string } | null;
  completed?: number;
  total_assignments?: number;
  average_score?: number | null;
  attention_count?: number;
};

export function HrRatingShortcutCard() {
  const { t } = useLocale();
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
      <h2 className="text-lg font-semibold text-slate-900">{t("hr.rating.shortcut.title")}</h2>
      <p className="text-sm text-slate-600">{t("hr.rating.shortcut.subtitle")}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{t("hr.rating.shortcut.period")}</dt>
          <dd className="font-medium">{data?.period?.name || "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("hr.rating.shortcut.progress")}</dt>
          <dd className="font-medium">
            {data?.completed ?? 0} / {data?.total_assignments ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("hr.rating.shortcut.avg")}</dt>
          <dd className="font-medium">{data?.average_score ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("hr.rating.shortcut.attention")}</dt>
          <dd className="font-medium">{data?.attention_count ?? 0}</dd>
        </div>
      </dl>
      <Link
        href="/hr/rating"
        className="mt-4 inline-flex rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
      >
        {t("hr.rating.shortcut.open")}
      </Link>
    </div>
  );
}
