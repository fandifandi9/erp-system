"use client";

import { pb } from "@/lib/pocketbase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { canAccess, getOperationalDashboardRoute, isHrAccount } from "@/lib/rbac";
import { hasHrOperationalWorkspace } from "@/lib/org/hr-workspace-access";
import { canAccessHrWebModule } from "@/lib/capabilities/web-access";
import {
  canAccessErpInventoryCore,
  canAccessInventory,
  canAccessWms,
  isWarehouseStaffOnly,
} from "@/lib/inventory/access";
import { SidebarAccordionSection } from "@/components/SidebarAccordionSection";
import { SidebarNavLinks } from "@/components/SidebarNavLinks";
import {
  GUDANG_NAV_ITEMS,
  KATALOG_NAV_ITEMS,
  PENJUALAN_NAV_ITEMS,
  PEMBELIAN_NAV_ITEMS,
  RETUR_NAV_ITEMS,
  POS_NAV_ITEMS,
  SDM_NAV_ITEMS_HR,
  KINERJA_NAV_ITEMS,
  LAPORAN_TEMUAN_NAV_ITEMS,
  KEUANGAN_NAV_ITEMS,
  LAPORAN_NAV_ITEMS,
  PENGATURAN_NAV_ITEMS,
  PENGATURAN_NAV_ITEMS_HR,
  isGudangSidebarPath,
  isKatalogSidebarPath,
  isPenjualanSidebarPath,
  isPembelianSidebarPath,
  isReturSidebarPath,
  isPosSidebarPath,
  isSdmSidebarPath,
  isKinerjaSidebarPath,
  isLaporanTemuanSidebarPath,
  isKeuanganSidebarPath,
  isLaporanSidebarPath,
  isLaporanSdmPath,
  isPengaturanSidebarPath,
} from "@/lib/wms/navigation";
import { canAccessCatalog } from "@/lib/catalog/catalog-access";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";
import { SidebarBrand } from "@/components/ui/sidebar-brand";
import { StaffSidebarNav } from "@/components/workspace/StaffSidebarNav";
import { HrSidebarNav } from "@/components/workspace/HrSidebarNav";
import { StaffDeskWorkbench } from "@/components/workspace/StaffDeskWorkbench";
import { WorkspaceMobileAccessFooter } from "@/components/workspace/WorkspaceMobileAccessFooter";
import { resolveDeskModulesForUser } from "@/lib/workspace/resolve-workspace";

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

function isBerandaPath(pathname: string, dashboardRoute: string | null): boolean {
  if (!dashboardRoute) return false;
  if (pathname === dashboardRoute) return true;
  if (dashboardRoute === "/dashboard-owner") {
    return pathname.startsWith("/dashboard-owner");
  }
  if (dashboardRoute === "/dashboard-staff") {
    return pathname.startsWith("/dashboard-staff");
  }
  if (dashboardRoute === "/hr") {
    return pathname === "/hr";
  }
  return false;
}

function isOnModuleRoute(pathname: string): boolean {
  return (
    isKatalogSidebarPath(pathname) ||
    isPenjualanSidebarPath(pathname) ||
    isPembelianSidebarPath(pathname) ||
    isReturSidebarPath(pathname) ||
    isGudangSidebarPath(pathname) ||
    isPosSidebarPath(pathname) ||
    isSdmSidebarPath(pathname) ||
    isKinerjaSidebarPath(pathname) ||
    isLaporanTemuanSidebarPath(pathname) ||
    isKeuanganSidebarPath(pathname) ||
    isLaporanSidebarPath(pathname) ||
    isPengaturanSidebarPath(pathname)
  );
}

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const { locale, t } = useLocale();
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const sync = () => setUser(pb.authStore.model || null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  if (!user) return null;

  const canManageHr = canAccessHrWebModule(user);
  const isHr = isHrAccount(user);
  const canInventory = canAccessInventory(user);
  const canGudang = canInventory && canAccessWms(user);
  const canBisnis = canInventory && canAccessErpInventoryCore(user) && !isWarehouseStaffOnly(user);
  const canKatalog = canAccessCatalog(user);
  const dashboardRoute = getOperationalDashboardRoute(user);
  /** HR-STAFF-01 — HR shell when Position/hub says HR, even if stuck on a staff URL. */
  const isHrShell =
    dashboardRoute === "/hr" || hasHrOperationalWorkspace(user);
  const isStaffShell = dashboardRoute === "/dashboard-staff" && !isHrShell;
  const useHrSidebarNav = isHrShell;
  const useStaffSidebarNav = isStaffShell;
  const useWideShell = isHrShell || isStaffShell;
  const deskModules = resolveDeskModulesForUser(user);
  const deskActive = deskModules.some((mod) =>
    mod.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  );

  const deskLinkClass = (href: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition" +
      (active
        ? " bg-amber-400 font-medium text-slate-900"
        : " text-slate-300 hover:bg-slate-800 hover:text-white")
    );
  };

  const onBerandaRoute =
    isBerandaPath(pathname, dashboardRoute) && !isOnModuleRoute(pathname);

  const subMenuClass =
    "block min-h-11 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition";

  const closeIfMobile = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      onMobileClose?.();
    }
  };

  const renderSection = (sectionKey: string, title: string, items: typeof KATALOG_NAV_ITEMS, active: boolean) => (
    <SidebarAccordionSection title={translateNavSection(locale, sectionKey, title)} active={active}>
      <SidebarNavLinks items={items} subMenuClass={subMenuClass} onNavigate={closeIfMobile} />
    </SidebarAccordionSection>
  );

  return (
    <div
      className={
        "w-0 shrink-0 overflow-visible " + (useWideShell ? "lg:w-72 lg:shrink-0" : "lg:w-64 lg:shrink-0")
      }
    >
      {mobileOpen ? (
        <button
          type="button"
          aria-label={translateNavSection(locale, "closeMenu", "Tutup menu")}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => onMobileClose?.()}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={
          "flex h-full max-h-[100dvh] shrink-0 flex-col bg-slate-900 text-white " +
          "fixed inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 ease-out " +
          (useWideShell
            ? "w-[min(20rem,90vw)] lg:static lg:z-auto lg:w-72 lg:max-h-none lg:shadow-none "
            : "w-[min(19rem,90vw)] lg:static lg:z-auto lg:w-64 lg:max-h-none lg:shadow-none ") +
          (mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        {useStaffSidebarNav ? (
          <div className="shrink-0 border-b border-slate-800 px-4 py-4 max-lg:pt-[max(1rem,env(safe-area-inset-top))]">
            <SidebarBrand />
          </div>
        ) : null}

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 max-lg:pt-[max(0.75rem,env(safe-area-inset-top))] md:px-4 lg:pt-4">
          {useHrSidebarNav ? (
            <>
              <HrSidebarNav onNavigate={closeIfMobile} />
              {canBisnis || canGudang || canKatalog ? (
                <div className="mt-3 border-t border-slate-700/80 pt-3">
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Modul lain
                  </p>
                  {canKatalog
                    ? renderSection("katalog", "Katalog Produk", KATALOG_NAV_ITEMS, isKatalogSidebarPath(pathname))
                    : null}
                  {canBisnis ? (
                    <>
                      {renderSection("penjualan", "Penjualan", PENJUALAN_NAV_ITEMS, isPenjualanSidebarPath(pathname))}
                      {renderSection("pembelian", "Pembelian", PEMBELIAN_NAV_ITEMS, isPembelianSidebarPath(pathname))}
                      {renderSection("retur", "Retur", RETUR_NAV_ITEMS, isReturSidebarPath(pathname))}
                      {renderSection("pos", "POS", POS_NAV_ITEMS, isPosSidebarPath(pathname))}
                      {renderSection("keuangan", "Keuangan", KEUANGAN_NAV_ITEMS, isKeuanganSidebarPath(pathname))}
                    </>
                  ) : null}
                  {canGudang
                    ? renderSection("gudang", "Manajemen Gudang", GUDANG_NAV_ITEMS, isGudangSidebarPath(pathname))
                    : null}
                </div>
              ) : null}
              <WorkspaceMobileAccessFooter onNavigate={closeIfMobile} />
            </>
          ) : useStaffSidebarNav ? (
            <>
              <StaffSidebarNav onNavigate={closeIfMobile} />
              <WorkspaceMobileAccessFooter onNavigate={closeIfMobile} />
            </>
          ) : (
            <>
          {dashboardRoute && !isHr ? (
            <Link
              href={dashboardRoute}
              onClick={closeIfMobile}
              className={
                "flex min-h-11 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition " +
                (onBerandaRoute
                  ? "bg-amber-400 text-slate-900"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white")
              }
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} />
              {translateNavSection(locale, "dashboard", "Dashboard")}
            </Link>
          ) : null}

          {canKatalog ? renderSection("katalog", "Katalog Produk", KATALOG_NAV_ITEMS, isKatalogSidebarPath(pathname)) : null}

          {canBisnis ? (
            <>
              {renderSection("penjualan", "Penjualan", PENJUALAN_NAV_ITEMS, isPenjualanSidebarPath(pathname))}
              {renderSection("pembelian", "Pembelian", PEMBELIAN_NAV_ITEMS, isPembelianSidebarPath(pathname))}
              {renderSection("retur", "Retur", RETUR_NAV_ITEMS, isReturSidebarPath(pathname))}
            </>
          ) : null}

          {canGudang ? renderSection("gudang", "Manajemen Gudang", GUDANG_NAV_ITEMS, isGudangSidebarPath(pathname)) : null}

          {canBisnis ? renderSection("pos", "POS", POS_NAV_ITEMS, isPosSidebarPath(pathname)) : null}

          {canManageHr
            ? renderSection(
                "sdm",
                "SDM",
                SDM_NAV_ITEMS_HR,
                isSdmSidebarPath(pathname),
              )
            : null}

          {canManageHr
            ? renderSection("kinerja", "Kinerja", KINERJA_NAV_ITEMS, isKinerjaSidebarPath(pathname))
            : null}

          {canAccess(user, "/hr/reports")
            ? renderSection(
                "laporanTemuan",
                "Laporan & Temuan",
                LAPORAN_TEMUAN_NAV_ITEMS,
                isLaporanTemuanSidebarPath(pathname) || (isHr && isLaporanSdmPath(pathname)),
              )
            : null}

          {canBisnis ? (
            <>
              {renderSection("keuangan", "Keuangan", KEUANGAN_NAV_ITEMS, isKeuanganSidebarPath(pathname))}
              {renderSection("laporan", "Laporan", LAPORAN_NAV_ITEMS, isLaporanSidebarPath(pathname))}
              {renderSection("pengaturan", "Pengaturan", PENGATURAN_NAV_ITEMS, isPengaturanSidebarPath(pathname))}
            </>
          ) : canManageHr ? (
            renderSection(
              "pengaturan",
              "Pengaturan",
              PENGATURAN_NAV_ITEMS_HR,
              isPengaturanSidebarPath(pathname),
            )
          ) : null}

          {deskModules.length > 0 ? (
            <SidebarAccordionSection
              title={t("workspace.staff.section.desk")}
              active={deskActive}
              compact
            >
              <StaffDeskWorkbench linkClass={deskLinkClass} onNavigate={closeIfMobile} />
            </SidebarAccordionSection>
          ) : null}

          <WorkspaceMobileAccessFooter onNavigate={closeIfMobile} />
            </>
          )}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-3 text-xs text-slate-500 md:p-4">
          SERBA System v3.0
        </div>
      </aside>
    </div>
  );
}
