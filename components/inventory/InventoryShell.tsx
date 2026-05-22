"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Warehouse,
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  MapPin,
  QrCode,
  Activity,
} from "lucide-react";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";

const NAV = [
  { href: "/inventory", label: "Ringkasan", icon: LayoutDashboard, exact: true },
  { href: "/inventory/stock", label: "Stok", icon: Boxes },
  { href: "/inventory/movements", label: "Movement", icon: ArrowLeftRight },
  { href: "/inventory/zones/checkin", label: "Check-in", icon: QrCode },
  { href: "/inventory/zones", label: "Zona", icon: MapPin, masterOnly: true },
  { href: "/inventory/activities", label: "Aktivitas", icon: Activity },
  { href: "/inventory/products", label: "Produk", icon: Package },
  { href: "/inventory/warehouses", label: "Gudang", icon: Warehouse, masterOnly: true },
] as const;

export function InventoryShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = pb.authStore.model;
  const showMaster = user && canManageInventoryMaster(user);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Inventory SERBA</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {NAV.filter((n) => !("masterOnly" in n && n.masterOnly) || showMaster).map((item) => {
          const active =
            "exact" in item && item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition " +
                (active
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200")
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
