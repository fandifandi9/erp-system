"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Tags, Award, Layers, Boxes, Printer } from "lucide-react";
import { isNavItemActive } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavLabel } from "@/lib/i18n/nav-catalog";

const TABS = [
  { href: "/katalog/produk", label: "Produk", icon: Package },
  { href: "/katalog/bundling", label: "Bundling", icon: Boxes },
  { href: "/inventory/categories", label: "Kategori", icon: Tags },
  { href: "/inventory/brands", label: "Brand", icon: Award },
  // Harga per toko diatur di Edit produk (tab Harga) — bukan halaman terpisah.
  // Mapping MP & Akun MP disembunyikan: SKU wajib sama dengan ERP dan akun MP
  // dibuat otomatis saat import. Halaman tetap bisa diakses via URL langsung.
  { href: "/wms/barcode", label: "Barcode & Label", icon: Printer },
] as const;

export function CatalogShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { locale, t } = useLocale();

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-indigo-50/30 to-slate-50 px-6 py-6 shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-100/50 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
              <Layers className="h-3.5 w-3.5" />
              {t("catalog.shell.section")}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <nav className="relative mt-5 flex flex-wrap gap-1 border-t border-slate-200/80 pt-4">
          {TABS.map((tab) => {
            const active = isNavItemActive(pathname, { href: tab.href, label: tab.label, icon: tab.icon });
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-900")
                }
              >
                <Icon className="h-4 w-4" />
                {translateNavLabel(locale, tab.href, tab.label)}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
