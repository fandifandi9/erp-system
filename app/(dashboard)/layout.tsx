"use client";

import { useEffect, useRef, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { canAccess, getDefaultRouteForUser, getOperationalDashboardRoute } from "@/lib/rbac";
import {
  shouldLogoutForSessionMismatch,
  syncWebSessionNonceFromUser,
} from "@/lib/auth-session";
import {
  clearClientAuthSession,
  restoreAuthFromHttpOnlyCookie,
  syncAuthStoreFromPbRecord,
} from "@/lib/pb-auth-cookie";
import { resolveClientAccessUser } from "@/lib/access/context";
import {
  clientCanAccessPath,
  refreshClientAccessSession,
  shouldRefreshClientAccessSession,
} from "@/lib/access/client-route-access";
import {
  getErrorMessage,
  isPocketBaseAuthError,
  isPocketBaseUnreachable,
} from "@/lib/errors";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";
import { WorkContextProvider } from "@/components/WorkContextProvider";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ToastProvider } from "@/components/ui/toast";

const SESSION_VERIFY_MS = 15_000;

/**
 * Segarkan user sesi via authRefresh — bukan getOne.
 * getOne sering 404 untuk HR/staff jika List/View rule koleksi `users` ketat
 * (owner biasanya masih bisa baca, sehingga seolah hanya “HR yang bermasalah”).
 */
async function fetchFreshUser(): Promise<Record<string, unknown>> {
  return Promise.race([
    pb
      .collection("users")
      .authRefresh({ requestKey: null })
      .then(async (auth) => {
        if (!auth.token) return (auth.record ?? {}) as Record<string, unknown>;
        return syncAuthStoreFromPbRecord(
          pb,
          auth.token,
          auth.record as Record<string, unknown>,
        );
      }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Verifikasi sesi timeout")), SESSION_VERIFY_MS);
    }),
  ]);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [booting, setBooting] = useState(true);
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);
  const [guardError, setGuardError] = useState("");
  const [guardRetry, setGuardRetry] = useState(0);
  const [authVersion, setAuthVersion] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const readyOnceRef = useRef(false);
  const routerRef = useRef(router);
  const routeEnrichAttemptRef = useRef<Set<string>>(new Set());
  routerRef.current = router;

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (mobileNavOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = prev || "";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  // Verifikasi sesi — sekali per mount / retry (bukan tiap ganti pathname / router identity)
  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      // Jangan robohkan pohon UI yang sudah siap (hindari race setState saat remount).
      if (!readyOnceRef.current) setBooting(true);
      setGuardError("");

      // 1) Session lokal valid? Jika tidak → restore dari HttpOnly cookie (divalidasi server).
      if (!pb.authStore.isValid || !pb.authStore.token || !pb.authStore.model) {
        const restored = await restoreAuthFromHttpOnlyCookie(pb);
        if (cancelled) return;
        if (!restored) {
          await clearClientAuthSession(pb);
          if (cancelled) return;
          routerRef.current.replace("/login");
          return;
        }
        syncWebSessionNonceFromUser(
          pb.authStore.model as { session_nonce?: unknown },
        );
      }

      // 2) Baru setelah auth state tersedia: refresh + cek status/nonce.
      try {
        const freshUser = await fetchFreshUser();
        if (cancelled) return;

        syncWebSessionNonceFromUser(freshUser as { session_nonce?: unknown });

        if (freshUser.status !== "active") {
          await clearClientAuthSession(pb);
          if (cancelled) return;
          routerRef.current.replace("/login");
          return;
        }

        if (shouldLogoutForSessionMismatch(freshUser as { session_nonce?: unknown })) {
          await clearClientAuthSession(pb);
          if (cancelled) return;
          routerRef.current.replace("/login?reason=session");
          return;
        }

        setSessionUser(freshUser as Record<string, unknown>);
        readyOnceRef.current = true;
        setBooting(false);
      } catch (err) {
        if (cancelled) return;

        const timeout =
          err instanceof Error && /timeout/i.test(err.message);

        if (isPocketBaseUnreachable(err) || timeout) {
          const host =
            typeof process.env.NEXT_PUBLIC_POCKETBASE_URL === "string"
              ? process.env.NEXT_PUBLIC_POCKETBASE_URL
              : "PocketBase";
          setGuardError(
            `Tidak terhubung ke server (${host}). Periksa internet / status PocketBase, lalu klik Coba lagi.`,
          );
          setBooting(false);
          return;
        }

        // 401/403: sesi expired/invalid — expected state, bukan application crash.
        if (isPocketBaseAuthError(err)) {
          await clearClientAuthSession(pb);
          if (cancelled) return;
          routerRef.current.replace("/login");
          return;
        }

        console.error("GUARD ERROR:", err);
        setGuardError(getErrorMessage(err, "Gagal memverifikasi sesi."));
        setBooting(false);
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [guardRetry]);

  useEffect(() => {
    return pb.authStore.onChange(() => setAuthVersion((n) => n + 1));
  }, []);

  // Cek akses rute — refresh enrichment dari server sebelum redirect prematur.
  useEffect(() => {
    if (booting || !sessionUser) return;

    let cancelled = false;

    const verifyRouteAccess = async () => {
      const storeModel = pb.authStore.model as Record<string, unknown> | null;
      let effectiveSession = sessionUser;

      if (clientCanAccessPath(storeModel, effectiveSession, pathname)) {
        return;
      }

      if (
        shouldRefreshClientAccessSession(storeModel, effectiveSession, pathname) &&
        !routeEnrichAttemptRef.current.has(pathname)
      ) {
        routeEnrichAttemptRef.current.add(pathname);
        const refreshed = await refreshClientAccessSession(pb);
        if (cancelled) return;
        if (refreshed) {
          effectiveSession = refreshed;
          setSessionUser(refreshed);
          if (clientCanAccessPath(pb.authStore.model as Record<string, unknown>, refreshed, pathname)) {
            return;
          }
        }
      }

      const accessUser = resolveClientAccessUser(
        pb.authStore.model as Record<string, unknown> | null,
        effectiveSession,
      );
      if (!accessUser || !canAccess(accessUser, pathname)) {
        routerRef.current.replace(getDefaultRouteForUser(accessUser ?? effectiveSession));
      }
    };

    void verifyRouteAccess();

    return () => {
      cancelled = true;
    };
  }, [booting, sessionUser, pathname, router, authVersion]);

  if (booting) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 text-slate-500">
        Memverifikasi akses...
      </div>
    );
  }

  if (guardError) {
    const pbUrl =
      typeof process.env.NEXT_PUBLIC_POCKETBASE_URL === "string"
        ? process.env.NEXT_PUBLIC_POCKETBASE_URL
        : "";
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          {guardError}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => setGuardRetry((n) => n + 1)}
          >
            Coba lagi
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              void clearClientAuthSession(pb).then(() => {
                router.replace("/login");
              });
            }}
          >
            Keluar & login ulang
          </button>
        </div>
        {pbUrl ? (
          <p className="max-w-md text-center text-xs text-slate-500">
            Buka di tab baru:{" "}
            <a href={pbUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
              {pbUrl}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  const isStaffShell =
    getOperationalDashboardRoute(pb.authStore.model as Record<string, unknown> | null) ===
      "/dashboard-staff" &&
    (pathname === "/dashboard-staff" || pathname.startsWith("/dashboard-staff/"));
  const isHrShell =
    getOperationalDashboardRoute(pb.authStore.model as Record<string, unknown> | null) === "/hr";
  const useCompactMain = isStaffShell && !isHrShell;

  return (
    <LocaleProvider>
      <ToastProvider>
      <WorkContextProvider>
        <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-erp-bg overflow-hidden">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Navbar
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onCloseMobileNav={() => setMobileNavOpen(false)}
            mobileNavOpen={mobileNavOpen}
          />

          <main
            className={
              "min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))] " +
              (useCompactMain
                ? "px-3 pt-2 sm:px-4 sm:pt-2"
                : "p-4 sm:p-5 md:p-6")
            }
          >
            {children}
          </main>
        </div>
      </div>
      <AppVersionWatermark variant="dashboard" />
      </WorkContextProvider>
      </ToastProvider>
    </LocaleProvider>
  );
}
