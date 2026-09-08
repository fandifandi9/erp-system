"use client";

import { useLocale } from "@/components/LocaleProvider";
import { ReportingCaseForm } from "@/components/hr/ReportingCaseForm";
import { ReportingModuleNav } from "@/components/hr/ReportingModuleNav";

export default function NewStaffReportPage() {
  const { t } = useLocale();
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
      <ReportingModuleNav />
      <h1 className="text-xl font-semibold">{t("hr.reporting.newReport")}</h1>
      <p className="text-sm text-slate-600">{t("hr.reporting.reportsSubtitle")}</p>
      <ReportingCaseForm kind="report" />
    </div>
  );
}
