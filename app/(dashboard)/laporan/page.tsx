"use client";

import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { LAPORAN_NAV_ITEMS } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";

export default function LaporanPage() {
  const { locale, t } = useLocale();
  const links = useMemo(() => {
    const base = navItemsToHubLinks(LAPORAN_NAV_ITEMS, "/laporan", locale);
    return [
      ...base,
      {
        href: "/bisnis/penjualan/import",
        label: t("hubs.laporan.importMp"),
        description: t("hubs.laporan.importMpDesc"),
        icon: FileSpreadsheet,
        color: "bg-slate-100 text-slate-700",
      },
    ];
  }, [locale, t]);

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "laporan", "Laporan")}
      subtitle={t("hubs.laporan.subtitle")}
      links={links}
    />
  );
}
