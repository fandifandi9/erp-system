"use client";

/**
 * True HR Desktop sidebar.
 * Order: Dasbor → workspace menus (… Laporan) → Meja Kerja → (Akses Mobile via shell footer).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";
import { SidebarAccordionSection } from "@/components/SidebarAccordionSection";
import { SidebarBrand } from "@/components/ui/sidebar-brand";
import { StaffDeskWorkbench } from "@/components/workspace/StaffDeskWorkbench";
import { hrWorkspaceConfig } from "@/lib/workspace/workspaces/hr";
import {
  filterCommonSectionsForUser,
  resolveDeskModulesForUser,
} from "@/lib/workspace/resolve-workspace";

type Props = {
  onNavigate?: () => void;
};

export function HrSidebarNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const { t } = useLocale();
  const user = pb.authStore.model as Record<string, unknown> | null;

  if (!user) return null;

  const workspaceSections = filterCommonSectionsForUser(hrWorkspaceConfig, user);
  const deskModules = resolveDeskModulesForUser(user);

  const linkBase =
    "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition";

  const linkClass = (href: string, exact = false) => {
    const active = exact
      ? pathname === href
      : pathname === href || (href !== "/hr" && pathname.startsWith(`${href}/`));
    return (
      linkBase +
      (active
        ? " bg-amber-400 font-medium text-slate-900"
        : " text-slate-300 hover:bg-slate-800 hover:text-white")
    );
  };

  const deskActive = deskModules.some((mod) =>
    mod.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  );

  const workspaceActive = workspaceSections.some((section) =>
    section.actions.some(
      (action) =>
        pathname === action.href ||
        (action.href !== "/hr" && pathname.startsWith(`${action.href}/`)),
    ),
  );

  return (
    <>
      <div className="mb-2 shrink-0 border-b border-slate-800 px-1 pb-3">
        <SidebarBrand />
        <p className="mt-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
          {t("workspace.hr.dashboard.title")}
        </p>
        <p className="px-2 text-[11px] text-slate-400">{t("workspace.hr.shellLabel")}</p>
      </div>

      <Link
        href="/hr"
        onClick={onNavigate}
        className={
          linkBase +
          (pathname === "/hr"
            ? " bg-amber-400 font-semibold text-slate-900"
            : " font-semibold text-slate-200 hover:bg-slate-800 hover:text-white")
        }
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} />
        {t("workspace.hr.action.dashboard")}
      </Link>

      {workspaceSections.map((section) => (
        <SidebarAccordionSection
          key={section.id}
          title={t(section.titleKey)}
          active={workspaceActive}
          compact
        >
          <ul className="space-y-0.5">
            {section.actions.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.id}>
                  <Link
                    href={action.href}
                    className={linkClass(action.href, action.href === "/hr")}
                    onClick={onNavigate}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                      <span className="leading-snug">{t(action.titleKey)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SidebarAccordionSection>
      ))}

      <SidebarAccordionSection
        title={t("workspace.staff.section.desk")}
        active={deskActive}
        compact
      >
        <StaffDeskWorkbench linkClass={linkClass} onNavigate={onNavigate} />
      </SidebarAccordionSection>
    </>
  );
}
