"use client";

import { useLocale } from "@/components/LocaleProvider";

/** Layout konten ERP Inventori — navigasi ada di sidebar utama. */
export function ErpInventoryShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {title ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            {t("inventory.shell.erpCore")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
