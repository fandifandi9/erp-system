"use client";

import { useLocale } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/design/cn";

export function LanguageSwitcher({
  compact = false,
  dropdown = false,
  variant = "legacy",
}: {
  compact?: boolean;
  dropdown?: boolean;
  /** `erp` uses global design tokens (Phase 35). */
  variant?: "legacy" | "erp";
}) {
  const { locale, setLocale, t } = useLocale();

  const erpBtn = (code: Locale, label: string) => (
    <button
      key={code}
      type="button"
      onClick={() => void setLocale(code)}
      className={cn(
        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        locale === code
          ? "bg-indigo-600 text-white"
          : "border border-erp-border bg-erp-surface text-erp-text-muted hover:bg-erp-surface-muted hover:text-erp-text",
      )}
      aria-pressed={locale === code}
    >
      {label}
    </button>
  );

  if (variant === "erp") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-erp-text">{t("profile.preferences.language")}</p>
        <div className="flex gap-2" role="group" aria-label={t("common.language")}>
          {erpBtn("id", t("common.indonesian"))}
          {erpBtn("en", t("common.english"))}
        </div>
      </div>
    );
  }

  const btn = (code: Locale, label: string, fullWidth = false) => (
    <button
      key={code}
      type="button"
      onClick={() => void setLocale(code)}
      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
        fullWidth ? "flex-1 py-2 text-sm" : ""
      } ${
        locale === code
          ? "bg-indigo-600 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
      aria-pressed={locale === code}
    >
      {label}
    </button>
  );

  if (dropdown) {
    return (
      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("common.language")}
        </p>
        <div className="flex gap-2">
          {btn("id", t("common.indonesian"), true)}
          {btn("en", t("common.english"), true)}
        </div>
      </div>
    );
  }

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
