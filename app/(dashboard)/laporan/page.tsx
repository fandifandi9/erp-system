"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { selectLaporanNavItems, showLaporanImportMp } from "@/lib/module/role-hub";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";
import { pb } from "@/lib/pocketbase";
import { useRouter } from "next/navigation";
import { isHrAccount, type AuthUserShape } from "@/lib/rbac";

export default function LaporanPage() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [user, setUser] = useState<AuthUserShape | null>(null);

  useEffect(() => {
    const sync = () => setUser((pb.authStore.model as AuthUserShape | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const hr = isHrAccount(user);

  useEffect(() => {
    if (hr) router.replace("/hr/reports");
  }, [hr, router]);

  const links = useMemo(() => {
    const base = navItemsToHubLinks(selectLaporanNavItems(user), "/laporan", locale);
    if (!showLaporanImportMp(user)) return base;
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
  }, [locale, t, user]);

  if (hr) return null;

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "laporan", "Laporan")}
      subtitle={user ? t("hubs.laporan.subtitle") : undefined}
      links={links}
    />
  );
}
