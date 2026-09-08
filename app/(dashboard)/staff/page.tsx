"use client";

import { useEffect, useMemo, useState } from "react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { SDM_NAV_ITEMS, SDM_NAV_ITEMS_HR } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";
import { pb } from "@/lib/pocketbase";
import { isHrAccount, type AuthUserShape } from "@/lib/rbac";

export default function SdmHubPage() {
  const { locale, t } = useLocale();
  const [user, setUser] = useState<AuthUserShape | null>(null);

  useEffect(() => {
    const sync = () => setUser((pb.authStore.model as AuthUserShape | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const links = useMemo(
    () => navItemsToHubLinks(isHrAccount(user) ? SDM_NAV_ITEMS_HR : SDM_NAV_ITEMS, "/staff", locale),
    [locale, user],
  );

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "sdm", "SDM")}
      subtitle={t("hubs.sdm.subtitle")}
      links={links}
    />
  );
}
