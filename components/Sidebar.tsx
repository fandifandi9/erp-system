"use client";

import { pb } from "@/lib/pocketbase";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { canAccess, getOperationalDashboardRoute } from "@/lib/rbac";
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
  BISNIS_NAV_MAIN,
  BISNIS_NAV_REFERENCE,
  STAFF_NAV_ITEMS,
  isAnyNavItemActive,
  isGudangSidebarPath,
  isBisnisSidebarPath,
  isStaffSidebarPath,
} from "@/lib/wms/navigation";

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

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setUser(pb.authStore.model || null);
  }, []);

  if (!user) return null;

  const canManageHr = canAccess(user, "/hr");
  const canInventory = canAccessInventory(user);
  const canGudang = canInventory && canAccessWms(user);
  const canBisnis = canInventory && canAccessErpInventoryCore(user) && !isWarehouseStaffOnly(user);
  const dashboardRoute = getOperationalDashboardRoute(user);

  const onGudangRoute = isGudangSidebarPath(pathname);
  const onBisnisRoute = isBisnisSidebarPath(pathname);
  const onStaffRoute = isStaffSidebarPath(pathname);
  const onBerandaRoute =
    isBerandaPath(pathname, dashboardRoute) && !onGudangRoute && !onBisnisRoute && !onStaffRoute;

  const subMenuClass =
    "block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition";

  const closeIfMobile = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      onMobileClose?.();
    }
  };

  return (
    <div className="w-0 shrink-0 overflow-visible lg:w-64 lg:shrink-0">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-[2px] lg:hidden"
          onClick={() => onMobileClose?.()}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={
          "flex h-full max-h-[100dvh] w-[min(19rem,90vw)] shrink-0 flex-col bg-slate-900 text-white " +
          "fixed inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 ease-out " +
          "lg:static lg:z-auto lg:w-64 lg:max-h-none lg:shadow-none " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3 max-lg:pt-[max(0.75rem,env(safe-area-inset-top))] md:px-4 lg:pt-4">
          {dashboardRoute ? (
            <Link
              href={dashboardRoute}
              onClick={closeIfMobile}
              className={
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition " +
                (onBerandaRoute
                  ? "bg-indigo-600 text-white"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white")
              }
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} />
              Beranda
            </Link>
          ) : null}

          {canGudang ? (
            <SidebarAccordionSection title="Manajemen Gudang" active={onGudangRoute}>
              <SidebarNavLinks
                items={GUDANG_NAV_ITEMS}
                subMenuClass={subMenuClass}
                onNavigate={closeIfMobile}
              />
            </SidebarAccordionSection>
          ) : null}

          {canBisnis ? (
            <SidebarAccordionSection title="Manajemen Bisnis" active={onBisnisRoute}>
              <SidebarNavLinks
                items={BISNIS_NAV_MAIN}
                subMenuClass={subMenuClass}
                onNavigate={closeIfMobile}
              />
              <SidebarAccordionSection
                title="Master & Pembayaran"
                compact
                active={isAnyNavItemActive(pathname, BISNIS_NAV_REFERENCE)}
                className="mt-1 border-t border-slate-800/50"
              >
                <SidebarNavLinks
                  items={BISNIS_NAV_REFERENCE}
                  subMenuClass={subMenuClass}
                  onNavigate={closeIfMobile}
                />
              </SidebarAccordionSection>
            </SidebarAccordionSection>
          ) : null}

          {canManageHr ? (
            <SidebarAccordionSection title="Manajemen Staff" active={onStaffRoute}>
              <SidebarNavLinks
                items={STAFF_NAV_ITEMS}
                subMenuClass={subMenuClass}
                onNavigate={closeIfMobile}
              />
            </SidebarAccordionSection>
          ) : null}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-3 text-xs text-slate-500 md:p-4">
          SERBA System v3.0
        </div>
      </aside>
    </div>
  );
}
