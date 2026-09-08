"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ReportingCaseList } from "@/components/hr/ReportingCaseList";
import { ReportingModuleNav } from "@/components/hr/ReportingModuleNav";
import { reportingAuthHeaders, reportingFetch } from "@/lib/hr/reporting-client";
import type { ReportingCase } from "@/lib/hr/reporting-types";

export function ReportingListPage({ kind }: { kind: "report" | "finding" }) {
  const { t } = useLocale();
  const [items, setItems] = useState<ReportingCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const api = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  const newHref = kind === "finding" ? "/hr/findings/new" : "/hr/reports/new";

  useEffect(() => {
    void (async () => {
      try {
        const res = await reportingFetch(api, { headers: reportingAuthHeaders(false) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(json.error || t("hr.reporting.errors.generic")));
          return;
        }
        setItems(json.items || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("hr.reporting.offline"));
      }
    })();
  }, [api, t]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6">
      <ReportingModuleNav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            {kind === "finding" ? t("hr.reporting.findingsTitle") : t("hr.reporting.reportsTitle")}
          </h1>
          <p className="text-sm text-slate-600">
            {kind === "finding" ? t("hr.reporting.findingsSubtitle") : t("hr.reporting.reportsSubtitle")}
          </p>
        </div>
        <Link
          href={newHref}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white"
        >
          {kind === "finding" ? t("hr.reporting.newFinding") : t("hr.reporting.newReport")}
        </Link>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : <ReportingCaseList kind={kind} items={items} />}
    </div>
  );
}
