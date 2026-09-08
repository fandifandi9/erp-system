"use client";

/**
 * Phase FLEX-ORG-01 — Director / Management workspace (thin foundation).
 * Not a permission wildcard — deep modules still require capability + scope.
 */

import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import { WorkspaceHeader } from "@/components/ui/workspace-header";
import {
  Briefcase,
  Building2,
  Clock,
  Package,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";

const MODULE_LINKS = [
  { href: "/dashboard-staff/attendance", label: "Absensi (cadangan desktop)", icon: Clock, path: "/dashboard-staff/attendance" },
  { href: "/hr", label: "HR / SDM", icon: Users, path: "/hr" },
  { href: "/keuangan", label: "Finance", icon: Wallet, path: "/keuangan" },
  { href: "/gudang", label: "Warehouse", icon: Package, path: "/gudang" },
  { href: "/pembelian", label: "Purchasing", icon: ShoppingCart, path: "/pembelian" },
  { href: "/penjualan", label: "Sales", icon: Briefcase, path: "/penjualan" },
] as const;

export default function DirectorDashboardPage() {
  const user = pb.authStore.model as Record<string, unknown> | null;
  const name = String(user?.name ?? "").trim() || "Director";

  const links = MODULE_LINKS.filter((m) => user && canAccess(user, m.path));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <WorkspaceHeader
        title="Director / Management"
        subtitle={`Selamat datang, ${name}. Workspace manajemen — akses modul mengikuti capability & scope.`}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Building2 className="h-4 w-4" />
          Modul yang tersedia untuk Anda
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Workspace ini bukan wildcard permission. Hanya modul dengan grant efektif yang tampil.
        </p>
        {links.length === 0 ? (
          <p className="text-sm text-slate-500">
            Belum ada modul yang dapat diakses. Hubungi Owner untuk assignment capability/modul.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-amber-300 hover:bg-amber-50"
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  {m.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
