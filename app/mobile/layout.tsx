"use client";

/**
 * Shell Mobile Companion — layout lebar tablet PC (bukan kolom HP sempit).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Smartphone } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { restoreAuthFromHttpOnlyCookie } from "@/lib/pb-auth-cookie";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ToastProvider } from "@/components/ui/toast";

/** ~tablet landscape width — seragam untuk semua rute /mobile. */
export const MOBILE_COMPANION_MAX_WIDTH = "max-w-4xl";

const TITLES: Record<string, string> = {
  "/mobile": "Beranda",
  "/mobile/attendance": "Absensi",
  "/mobile/attendance/history": "Riwayat absensi",
  "/mobile/leave": "Cuti",
  "/mobile/overtime": "Lembur",
  "/mobile/field-activity": "Luar kantor",
  "/mobile/izin-off": "Off",
  "/mobile/my-submissions": "Pengajuan Saya",
  "/mobile/payroll": "Slip Gaji",
  "/mobile/reports": "Laporan & Temuan",
  "/mobile/profile": "Profil Saya",
};

export default function MobileCompanionLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isHome = pathname === "/mobile" || pathname === "/mobile/";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await restoreAuthFromHttpOnlyCookie(pb, { force: false });
      if (cancelled) return;
      if (!pb.authStore.isValid) {
        router.replace("/login");
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const title =
    TITLES[pathname] ||
    (pathname.startsWith("/mobile/leave") ? "Cuti" : "Mobile Companion");

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-slate-400">
        Memuat…
      </div>
    );
  }

  return (
    <LocaleProvider>
      <ToastProvider>
        <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
          {!isHome ? (
            <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
              <div className={`mx-auto flex ${MOBILE_COMPANION_MAX_WIDTH} items-center gap-3`}>
                <Link
                  href="/mobile"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-sky-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Menu
                </Link>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-sky-400" />
                  <h1 className="truncate text-sm font-semibold text-slate-100">{title}</h1>
                </div>
              </div>
            </header>
          ) : null}
          <div className={isHome ? "" : `mx-auto ${MOBILE_COMPANION_MAX_WIDTH} px-4 py-5 sm:px-6`}>
            {children}
          </div>
        </div>
      </ToastProvider>
    </LocaleProvider>
  );
}
