"use client";

import { useLocale } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();

  const btn = (code: Locale, label: string) => (
    <button
      key={code}
      type="button"
      onClick={() => void setLocale(code)}
      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
        locale === code
          ? "bg-indigo-600 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
      aria-pressed={locale === code}
    >
      {label}
    </button>
  );

  if (compact) {
    return (
      <div
        className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5"
        aria-label={t("common.language")}
      >
        {btn("id", "ID")}
        {btn("en", "EN")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{t("common.language")}</p>
      <div className="flex gap-2">
        {btn("id", t("common.indonesian"))}
        {btn("en", t("common.english"))}
      </div>
    </div>
  );
}
