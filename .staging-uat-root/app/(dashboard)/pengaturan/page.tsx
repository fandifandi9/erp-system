"use client";

import { useMemo } from "react";
import { Briefcase, Shield } from "lucide-react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { PENGATURAN_NAV_ITEMS } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection, translateNavLabel, translateHubDescription } from "@/lib/i18n/nav-catalog";

export default function PengaturanPage() {
  const { locale, t } = useLocale();
  const links = useMemo(() => {
    const base = navItemsToHubLinks(PENGATURAN_NAV_ITEMS, "/pengaturan", locale);
    const konteksLabel = translateNavLabel(locale, "/pengaturan/konteks-kerja", "Konteks kerja");
    return [
      base[0],
      {
        href: "/pengaturan/konteks-kerja",
        label: konteksLabel,
        description: translateHubDescription(locale, "/pengaturan/konteks-kerja", konteksLabel),
        icon: Briefcase,
        color: "bg-violet-50 text-violet-600",
      },
      {
        href: "/pengaturan/akses-entitas",
        label: "Akses Entitas",
        description: "Hak akses pengguna per PT/CV",
        icon: Shield,
        color: "bg-blue-50 text-blue-600",
      },
      ...base.slice(1),
    ];
  }, [locale]);

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "pengaturan", "Pengaturan")}
      subtitle={t("hubs.pengaturan.subtitle")}
      links={links}
    />
  );
}
