"use client";

import Link from "next/link";
import { ArrowLeft, Plug, Database, Store, Link2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function IntegrasiPage() {
  const { t } = useLocale();
  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? t("pengaturan.integrasi.envUnset");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/pengaturan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("pengaturan.integrasi.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pengaturan.integrasi.subtitle")}</p>
      </div>

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-4 p-5">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800">{t("pengaturan.integrasi.pbTitle")}</p>
            <p className="mt-1 break-all text-sm text-slate-600">{pbUrl}</p>
            <p className="mt-1 text-xs text-slate-500">
              {t("pengaturan.integrasi.pbDesc")}{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">{pbUrl}/api/</code>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5">
          <Store className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
          <div>
            <p className="font-semibold text-slate-800">{t("pengaturan.integrasi.mpTitle")}</p>
            <p className="mt-1 text-sm text-slate-600">{t("pengaturan.integrasi.mpDesc")}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/bisnis/marketplace" className="font-medium text-indigo-600 hover:underline">
                {t("pengaturan.integrasi.mpMaster")}
              </Link>
              <Link href="/katalog/mapping" className="font-medium text-indigo-600 hover:underline">
                {t("pengaturan.integrasi.mpMapping")}
              </Link>
              <Link href="/bisnis/penjualan/import" className="font-medium text-indigo-600 hover:underline">
                {t("pengaturan.integrasi.mpImport")}
              </Link>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
          <div>
            <p className="font-semibold text-slate-800">{t("pengaturan.integrasi.emailTitle")}</p>
            <p className="mt-1 text-sm text-slate-600">
              {t("pengaturan.integrasi.emailDesc")}{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">RESEND_API_KEY</code>.{" "}
              {t("pengaturan.integrasi.emailOverride")}{" "}
              <Link href="/bisnis/store" className="text-indigo-600 hover:underline">
                {t("pengaturan.common.storeSettings")}
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4 p-5">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <p className="font-semibold text-slate-800">{t("pengaturan.integrasi.webhookTitle")}</p>
            <p className="mt-1 text-sm text-slate-500">
              {t("pengaturan.integrasi.webhookDesc")}{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">app/api</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
