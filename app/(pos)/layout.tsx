"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, LayoutGrid, History } from "lucide-react";
import { canAccess } from "@/lib/rbac";
import { clearPosSession } from "@/lib/pos/session";
import { loadPosSession } from "@/lib/pos/session";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!pb.authStore.isValid) {
      router.replace("/login?next=/pos");
      return;
    }
    const user = pb.authStore.model as Record<string, unknown>;
    if (!canAccess(user, "/bisnis/penjualan")) {
      router.replace("/erp-locked");
      return;
    }
    setReady(true);
  }, [router]);

  const handlePosLogout = () => {
    clearPosSession();
    router.push("/pos/setup");
  };

  const session = ready ? loadPosSession() : null;

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-900 text-white">
        Memuat POS…
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-100">
      <header className="pos-app-header sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Kasir POS</p>
          {session ? (
            <p className="truncate text-sm font-medium text-slate-800">
              {session.responsibleName} · {session.storeName} · {session.warehouseName}
              {session.mode === "wms" && session.channelName
                ? ` · ${session.channelName}`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Belum ada sesi kasir</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pathname !== "/pos/setup" && session && (
            <Link
              href="/pos/history"
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Riwayat transaksi"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Riwayat</span>
            </Link>
          )}
          <Link
            href="/bisnis"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            title="Kembali ke ERP"
          >
            <LayoutGrid className="h-5 w-5" />
          </Link>
          {pathname !== "/pos/setup" && (
            <button
              type="button"
              onClick={handlePosLogout}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Ganti POS</span>
            </button>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
