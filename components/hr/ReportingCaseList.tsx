"use client";

import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import type { ReportingCase } from "@/lib/hr/reporting-types";

type Props = {
  kind: "report" | "finding";
  items: ReportingCase[];
};

export function ReportingCaseList({ kind, items }: Props) {
  const { t, locale } = useLocale();
  const base = kind === "finding" ? "/hr/findings" : "/hr/reports";

  if (!items.length) {
    return <p className="text-sm text-slate-600">{t("hr.reporting.empty")}</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:hidden">
        {items.map((row) => (
          <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-900">{row.title}</p>
            <p className="mt-1 text-sm text-slate-600">
              {t(`hr.reporting.categories.${row.category}`)} · {t(`hr.reporting.status.${row.status}`)}
            </p>
            <p className="text-xs text-slate-500">
              {row.created
                ? new Date(row.created).toLocaleDateString(locale === "en" ? "en-GB" : "id-ID")
                : "—"}
            </p>
            <Link href={`${base}/${row.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-indigo-700">
              {t("hr.common.viewDetail")}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-500">
              <th className="py-2 pr-3">{t("hr.reporting.titleField")}</th>
              <th className="py-2 pr-3">{t("hr.reporting.category")}</th>
              <th className="py-2 pr-3">{t("hr.reporting.date")}</th>
              <th className="py-2 pr-3">{t("hr.reporting.statusLabel")}</th>
              <th className="py-2 pr-3">{t("hr.reporting.priority")}</th>
              <th className="py-2">{t("hr.common.viewDetail")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium">{row.title}</td>
                <td className="py-2 pr-3">{t(`hr.reporting.categories.${row.category}`)}</td>
                <td className="py-2 pr-3">
                  {row.created
                    ? new Date(row.created).toLocaleDateString(locale === "en" ? "en-GB" : "id-ID")
                    : "—"}
                </td>
                <td className="py-2 pr-3">{t(`hr.reporting.status.${row.status}`)}</td>
                <td className="py-2 pr-3">{t(`hr.reporting.priorities.${row.priority}`)}</td>
                <td className="py-2">
                  <Link href={`${base}/${row.id}`} className="text-indigo-700">
                    {t("hr.common.viewDetail")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
