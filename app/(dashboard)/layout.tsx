"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";
import { useStandaloneDisplay } from "@/lib/use-standalone-display";
import {
  clearWebSessionNonce,
  shouldLogoutForSessionMismatch,
} from "@/lib/auth-session";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const preferDrawerNav = useStandaloneDisplay();

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

  // =========================
  // 🔐 ROUTE GUARD
  // =========================
  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      const current = pb.authStore.model;

      // ❌ belum login
      if (!current) {
        router.replace("/login");
        return;
      }

      try {
        // 🔥 ambil data terbaru dari server
        const freshUser = await pb
          .collection("users")
          .getOne(current.id, { requestKey: null });

        if (!isMounted) return;

        // ❌ kalau inactive
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

        // ❌ tidak punya akses ke halaman
        if (!canAccess(freshUser, pathname)) {
          router.replace(getDefaultRouteForUser(freshUser));
          return;
        }

        // ✅ aman
        setChecking(false);

      } catch (err) {
        console.error("GUARD ERROR:", err);
        clearWebSessionNonce();
        pb.authStore.clear();
        router.replace("/login");
      }
    };

    checkUser();

    return () => {
      isMounted = false;
    };
  }, [router, pathname]);

  // =========================
  // ⏳ LOADING STATE
  // =========================
  if (checking) {
    return (
      <div className="p-6 text-slate-500">
        Memverifikasi akses...
      </div>
    );
  }

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-slate-50 overflow-hidden">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        preferDrawerNav={preferDrawerNav}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          mobileNavOpen={mobileNavOpen}
          preferDrawerNav={preferDrawerNav}
        />

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}