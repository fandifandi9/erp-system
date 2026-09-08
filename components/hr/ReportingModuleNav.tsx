"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { canAccess, type AuthUserShape } from "@/lib/rbac";
import { useLocale } from "@/components/LocaleProvider";

export function ReportingModuleNav() {
  const pathname = usePathname() || "";
  const { t } = useLocale();
  const [user, setUser] = useState<AuthUserShape | null>(null);

  useEffect(() => {
    const sync = () => setUser((pb.authStore.model as AuthUserShape | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const showSummary = Boolean(user && canAccess(user, "/laporan/sdm"));
  const showFindings = Boolean(user && canAccess(user, "/hr/findings"));

  const links = [
    showSummary
      ? { href: "/laporan/sdm", label: t("hr.reporting.nav.summary"), match: (p: string) => p === "/laporan/sdm" }
      : null,
    {
      href: "/hr/reports",
      label: t("hr.reporting.nav.reports"),
      match: (p: string) => p === "/hr/reports" || p.startsWith("/hr/reports/"),
    },
    showFindings
      ? {
          href: "/hr/findings",
          label: t("hr.reporting.nav.findings"),
          match: (p: string) => p === "/hr/findings" || p.startsWith("/hr/findings/"),
        }
      : null,
  ].filter((x): x is { href: string; label: string; match: (p: string) => boolean } => x != null);

  if (links.length < 2) return null;

  return (
    <nav className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-3">
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium " +
              (active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
