"use client";

import Link from "next/link";
import { ArrowLeft, Bell, Mail } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/components/LocaleProvider";

export default function NotifikasiPage() {
  const { t } = useLocale();
  const resendConfigured = Boolean(process.env.NEXT_PUBLIC_RESEND_CONFIGURED);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/pengaturan" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t("pengaturan.notifikasi.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pengaturan.notifikasi.subtitle")}</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <LanguageSwitcher />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="font-medium text-slate-800">{t("pengaturan.notifikasi.activityTitle")}</p>
              <p className="text-sm text-slate-500">{t("pengaturan.notifikasi.activityDesc")}</p>
            </div>
          </div>
          <p className="mt-3 text-sm">
            <Link href="/aktivitas" className="font-medium text-indigo-600 hover:underline">
              {t("pengaturan.notifikasi.activityLink")}
            </Link>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="font-medium text-slate-800">{t("pengaturan.notifikasi.emailTitle")}</p>
              <p className="text-sm text-slate-500">
                {resendConfigured
                  ? t("pengaturan.notifikasi.emailConfigured")
                  : t("pengaturan.notifikasi.emailNotConfigured")}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {t("pengaturan.notifikasi.emailOverride")}{" "}
            <Link href="/bisnis/store" className="text-indigo-600 hover:underline">
              {t("pengaturan.common.storeSettings")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
