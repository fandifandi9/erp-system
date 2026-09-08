"use client";

import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { WorkContextSettings } from "@/components/WorkContextSettings";
import { useLocale } from "@/components/LocaleProvider";

export default function KonteksKerjaPage() {
  const { t } = useLocale();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/pengaturan"
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("pengaturan.konteks.title")}</h1>
            <p className="text-sm text-slate-500">{t("pengaturan.konteks.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <WorkContextSettings />
      </div>
    </div>
  );
}
