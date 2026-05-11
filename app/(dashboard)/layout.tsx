"use client";

import { useEffect, useState } from "react";
import type { UnsubscribeFunc } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

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
          pb.authStore.clear();
          router.replace("/login");
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
  // 🔴 REALTIME LOGOUT (STATUS)
  // =========================
  useEffect(() => {
    let unsubscribe: UnsubscribeFunc | undefined;

    const setupSubscription = async () => {
      unsubscribe = await pb.collection("users").subscribe("*", (e) => {
        const current = pb.authStore.model;

        if (!current) return;

        // 🔥 hanya cek user yang sedang login
        if (e.record.id === current.id) {
          if (e.record.status !== "active") {
            pb.authStore.clear();
            window.location.href = "/login";
          }
        }
      });
    };

    setupSubscription();

    return () => {
      void unsubscribe?.();
    };
  }, []);

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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}