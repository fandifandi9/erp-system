"use client";

import { useMemo } from "react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { SDM_NAV_ITEMS } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";

export default function SdmHubPage() {
  const { locale, t } = useLocale();
  const links = useMemo(
    () => navItemsToHubLinks(SDM_NAV_ITEMS, "/staff", locale),
    [locale],
  );

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "sdm", "SDM")}
      subtitle={t("hubs.sdm.subtitle")}
      links={links}
    />
  );
}
