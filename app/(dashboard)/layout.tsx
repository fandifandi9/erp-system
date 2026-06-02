"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";
import {
  clearWebSessionNonce,
  shouldLogoutForSessionMismatch,
  syncWebSessionNonceFromUser,
} from "@/lib/auth-session";
import {
  getErrorMessage,
  isPocketBaseAuthError,
  isPocketBaseUnreachable,
} from "@/lib/errors";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";

const SESSION_VERIFY_MS = 15_000;

async function fetchFreshUser(userId: string) {
  return Promise.race([
    pb.collection("users").getOne(userId, { requestKey: null }),
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  // Verifikasi sesi — sekali per mount / retry (bukan tiap ganti pathname)
  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      setBooting(true);
      setGuardError("");
      const current = pb.authStore.model;

      if (!current) {
        router.replace("/login");
        return;
      }

      try {
        const freshUser = await fetchFreshUser(current.id);
        if (cancelled) return;

        syncWebSessionNonceFromUser(freshUser as { session_nonce?: unknown });

        if (freshUser.status !== "active") {
          clearWebSessionNonce();
          pb.authStore.clear();
          router.replace("/login");
          return;
        }

        if (shouldLogoutForSessionMismatch(freshUser as { session_nonce?: unknown })) {
          clearWebSessionNonce();
          pb.authStore.clear();
          router.replace("/login?reason=session");
          return;
        }

        setSessionUser(freshUser as Record<string, unknown>);
        setBooting(false);
      } catch (err) {
        if (cancelled) return;
        console.error("GUARD ERROR:", err);

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

        if (isPocketBaseAuthError(err)) {
          clearWebSessionNonce();
          pb.authStore.clear();
          router.replace("/login");
          return;
        }

        setGuardError(getErrorMessage(err, "Gagal memverifikasi sesi."));
        setBooting(false);
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [router, guardRetry]);

  // Cek akses rute — tanpa layar penuh "Memverifikasi akses..."
  useEffect(() => {
    if (booting || !sessionUser) return;
    if (!canAccess(sessionUser, pathname)) {
      router.replace(getDefaultRouteForUser(sessionUser));
    }
  }, [booting, sessionUser, pathname, router]);

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
              clearWebSessionNonce();
              pb.authStore.clear();
              router.replace("/login");
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

  return (
    <>
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-slate-50 overflow-hidden">
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

          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <AppVersionWatermark variant="dashboard" />
    </>
  );
}
