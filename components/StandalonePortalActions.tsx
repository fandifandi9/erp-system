"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, LayoutGrid, LogOut, User } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess, getOperationalDashboardRoute } from "@/lib/rbac";

/** Label disembunyikan di layar sempit (ikon saja) supaya header PWA tidak bertabrakan. */
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
  /** Di halaman profil: tampilkan pintasan ke absensi. */
  showAttendanceShortcut?: boolean;
  /** Tampilkan tombol keluar akun (berguna di PWA / layar blokir). */
  showLogout?: boolean;
};

/** Tombol Profil, Absensi (opsional), dan Dashboard sesuai RBAC. */
export function StandalonePortalActions({
  omitProfile = false,
  showAttendanceShortcut = false,
  showLogout = false,
}: StandalonePortalActionsProps) {
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
      {showAttendanceShortcut && sessionUser && canAccess(sessionUser, "/attendance") && (
        <Link href="/attendance" className={btnGhost} title="Absensi" aria-label="Buka absensi">
          <Clock className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>Absensi</span>
        </Link>
      )}
      {showProfile && (
        <Link href="/profile" className={btnGhost} title="Profil" aria-label="Buka profil">
          <User className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>Profil</span>
        </Link>
      )}
      {showDashboardDoor && opsDashboard && (
        <Link
          href={opsDashboard}
          className={btnDashboard}
          title="Dashboard kerja"
          aria-label="Buka dashboard web (HR, Owner, atau staf operasional)"
        >
          <LayoutGrid className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>Dashboard</span>
        </Link>
      )}
      {showLogout && sessionUser && (
        <button
          type="button"
          onClick={handleLogout}
          className={btnLogout}
          title="Keluar"
          aria-label="Keluar akun"
        >
          <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0 sm:h-4 sm:w-4" aria-hidden />
          <span className={labelHiddenNarrow}>Keluar</span>
        </button>
      )}
    </>
  );
}
