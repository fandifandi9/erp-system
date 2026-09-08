"use client";

import { useEffect, useMemo, useState } from "react";
import { Briefcase, Layers, Shield } from "lucide-react";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { selectPengaturanNavItems, showOwnerPengaturanExtras } from "@/lib/module/role-hub";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection, translateNavLabel, translateHubDescription } from "@/lib/i18n/nav-catalog";
import { pb } from "@/lib/pocketbase";
import { isHrAccount, type AuthUserShape } from "@/lib/rbac";

export default function PengaturanPage() {
  const { locale, t } = useLocale();
  const [user, setUser] = useState<AuthUserShape | null>(null);

  useEffect(() => {
    const sync = () => setUser((pb.authStore.model as AuthUserShape | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const hr = isHrAccount(user);

  const links = useMemo(() => {
    const base = navItemsToHubLinks(selectPengaturanNavItems(user), "/pengaturan", locale);
    if (!showOwnerPengaturanExtras(user)) return base;
    const konteksLabel = translateNavLabel(locale, "/pengaturan/konteks-kerja", "Konteks kerja");
    const extras = [
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
      {
        href: "/pengaturan/akses-modul",
        label: "Akses Modul",
        description: "Penugasan modul, capability, dan scope entitas",
        icon: Layers,
        color: "bg-violet-50 text-violet-600",
      },
    ];
    const seen = new Set(base.map((l) => l.href).filter(Boolean));
    const uniqueExtras = extras.filter((l) => l.href && !seen.has(l.href));
    return [base[0], ...uniqueExtras, ...base.slice(1)].filter(Boolean);
  }, [locale, user]);

  return (
    <ModuleHubPage
      title={translateNavSection(locale, "pengaturan", "Pengaturan")}
      subtitle={user ? t(hr ? "hubs.pengaturan.subtitleHr" : "hubs.pengaturan.subtitle") : undefined}
      links={links}
    />
  );
}
