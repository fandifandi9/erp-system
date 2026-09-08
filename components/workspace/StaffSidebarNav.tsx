"use client";

/**
 * Staff Desktop sidebar.
 * Order: Dasbor → personal/common (… Laporan) → Meja Kerja → (Akses Mobile via shell footer).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";
import { SidebarAccordionSection } from "@/components/SidebarAccordionSection";
import { staffWorkspaceConfig } from "@/lib/workspace/workspaces/staff";
import { filterCommonSectionsForUser, resolveDeskModulesForUser } from "@/lib/workspace/resolve-workspace";
import { StaffDeskWorkbench } from "@/components/workspace/StaffDeskWorkbench";
import { hasHrOperationalWorkspace } from "@/lib/org/hr-workspace-access";
import {
  isOrgWorkspaceEnriched,
  SESSION_ACTIVE_ORG_POSITION_NAME_FIELD,
} from "@/lib/org/resolve-primary-workspace";

const STAFF_DASHBOARD = "/dashboard-staff";

type Props = {
  onNavigate?: () => void;
};

export function StaffSidebarNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const { t } = useLocale();
  const user = pb.authStore.model as Record<string, unknown> | null;

  if (!user) return null;

  const commonSections = filterCommonSectionsForUser(staffWorkspaceConfig, user);
  const deskModules = resolveDeskModulesForUser(user);
  const positionName = String(user[SESSION_ACTIVE_ORG_POSITION_NAME_FIELD] ?? "").trim();
  const showHrDomainHint =
    isOrgWorkspaceEnriched(user) &&
    Boolean(positionName) &&
    !hasHrOperationalWorkspace(user);

  const linkBase =
    "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition";

  const linkClass = (href: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      linkBase +
      (active
        ? " bg-amber-400 font-medium text-slate-900"
        : " text-slate-300 hover:bg-slate-800 hover:text-white")
    );
  };

  const dasborActive = pathname === STAFF_DASHBOARD;
  const deskActive = deskModules.some((mod) =>
    mod.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  );

  return (
    <>
      {showHrDomainHint ? (
        <div className="mx-2 mb-3 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-[11px] leading-snug text-amber-100">
          <p className="font-semibold text-amber-200">Workspace masih personal</p>
          <p className="mt-1 text-amber-100/90">
            Jabatan <span className="font-medium">{positionName}</span> belum punya Domain Fungsi{" "}
            <span className="font-medium">HR</span>. Minta Owner set di Pengaturan → Struktur
            Organisasi, lalu login ulang — baru menu SDM (Karyawan, Kehadiran, dll.) muncul.
          </p>
        </div>
      ) : null}

      <Link
        href={STAFF_DASHBOARD}
        onClick={onNavigate}
        className={
          linkBase +
          (dasborActive
            ? " bg-amber-400 font-semibold text-slate-900"
            : " font-semibold text-slate-200 hover:bg-slate-800 hover:text-white")
        }
      >
        <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} />
        {t("workspace.staff.sidebar.dashboard")}
      </Link>

      {commonSections.map((section) => {
        const sectionActive = section.actions.some(
          (action) =>
            pathname === action.href || pathname.startsWith(`${action.href}/`),
        );

        return (
          <SidebarAccordionSection
            key={section.id}
            title={t(section.titleKey)}
            active={sectionActive}
            compact
          >
            <ul className="space-y-0.5">
              {section.actions.map((action) => {
                const Icon = action.icon;
                return (
                  <li key={action.id}>
                    <Link
                      href={action.href}
                      className={linkClass(action.href)}
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
        );
      })}

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
