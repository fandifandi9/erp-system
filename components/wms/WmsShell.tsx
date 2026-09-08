"use client";

import { useLocale } from "@/components/LocaleProvider";

/** Layout konten WMS — navigasi ada di sidebar utama. */
export function WmsShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {title ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
            {t("wms.shell.operation")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
