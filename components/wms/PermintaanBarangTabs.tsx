"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";
import { useLocale } from "@/components/LocaleProvider";

const TAB_KEYS = [
  { href: PERMINTAAN_BARANG.picking, key: "wms.permintaan.tabPicking", icon: ShoppingCart },
  { href: PERMINTAAN_BARANG.validasi, key: "wms.permintaan.tabValidate", icon: ShieldCheck },
  { href: PERMINTAAN_BARANG.pickup, key: "wms.permintaan.tabPickup", icon: Truck },
  { href: PERMINTAAN_BARANG.selesai, key: "wms.permintaan.tabDone", icon: CheckCircle2 },
] as const;

export function PermintaanBarangTabs() {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {TAB_KEYS.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition " +
              (active
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-800")
            }
          >
            <Icon className="h-4 w-4" />
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
