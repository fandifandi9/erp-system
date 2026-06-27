"use client";

import { useMemo } from "react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { KATALOG_NAV_ITEMS } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";

export default function KatalogHubPage() {
  const { locale, t } = useLocale();
  const links = useMemo(
    () => navItemsToHubLinks(KATALOG_NAV_ITEMS, "/katalog", locale),
    [locale],
  );

  return (
    <ModuleHubPage
      title={t("catalog.hub.title")}
      subtitle={t("catalog.hub.subtitle")}
      links={links}
    />
  );
}
