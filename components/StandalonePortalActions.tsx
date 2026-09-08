"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutGrid, LogOut, User } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess, getOperationalDashboardRoute } from "@/lib/rbac";
import { useLocale } from "@/components/LocaleProvider";

/** Label disembunyikan di layar sempit (ikon saja) supaya header tidak bertabrakan. */
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 sm:px-3 sm:py-1.5";
const btnDashboard =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-2 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100 sm:px-3 sm:py-1.5";
const btnLogout =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-2 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 sm:px-3 sm:py-1.5";
/** Layar &lt; md: teks disembunyikan (ikon + tooltip), hindari tabrakan dengan merek header. */
const labelHiddenNarrow = "max-md:sr-only";

export type StandalonePortalActionsProps = {
  /** Di halaman profil: sembunyikan tautan Profil. */
  omitProfile?: boolean;
  /** Tampilkan tombol keluar akun (berguna di layar profil / blokir). */
  showLogout?: boolean;
};

/** Tombol Profil dan Dashboard sesuai RBAC. */
export function StandalonePortalActions({
  omitProfile = false,
  showLogout = false,
}: StandalonePortalActionsProps) {
  const { t } = useLocale();
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const sync = () => {
      setSessionUser((pb.authStore.model as Record<string, unknown> | null) ?? null);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const opsDashboard = sessionUser ? getOperationalDashboardRoute(sessionUser) : null;
  const showDashboardDoor = Boolean(opsDashboard);
  const showProfile = Boolean(sessionUser && canAccess(sessionUser, "/profile") && !omitProfile);

  const handleLogout = () => {
    pb.authStore.clear();
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  };

  return (
    <>
      {showProfile && (
        <Link
          href="/profile"
          className={btnGhost}
          title={t("nav.profile")}
          aria-label={t("nav.openLink", { label: t("nav.profile") })}
        >
          <User className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>{t("nav.profile")}</span>
        </Link>
      )}
      {showDashboardDoor && opsDashboard && (
        <Link
          href={opsDashboard}
          className={btnDashboard}
          title={t("nav.dashboard")}
          aria-label={t("nav.openLink", { label: t("nav.dashboard") })}
        >
          <LayoutGrid className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>{t("nav.dashboard")}</span>
        </Link>
      )}
      {showLogout && sessionUser && (
        <button
          type="button"
          onClick={handleLogout}
          className={btnLogout}
          title={t("nav.logout")}
          aria-label={t("nav.logout")}
        >
          <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>{t("nav.logout")}</span>
        </button>
      )}
    </>
  );
}
