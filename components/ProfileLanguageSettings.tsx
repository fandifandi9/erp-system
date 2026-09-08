"use client";

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLocale } from "@/components/LocaleProvider";

/** Pengaturan bahasa — juga tersedia di menu profil navbar. */
export function ProfileLanguageSettings() {
  const { t } = useLocale();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t("common.language")}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{t("hr.profile.self.languageDesc")}</p>
      <div className="mt-4">
        <LanguageSwitcher />
      </div>
    </section>
  );
}
