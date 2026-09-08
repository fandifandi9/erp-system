"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import {
  RETUR_MODULE,
  isReturPenjualanPath,
  isReturPembelianPath,
} from "@/lib/bisnis/module-routes";
import { useLocale } from "@/components/LocaleProvider";

const TABS = [
  {
    href: RETUR_MODULE.penjualan,
    labelId: "Retur penjualan",
    labelEn: "Sales returns",
    icon: ArrowDownLeft,
    isActive: isReturPenjualanPath,
  },
  {
    href: RETUR_MODULE.pembelian,
    labelId: "Retur pembelian",
    labelEn: "Purchase returns",
    icon: ArrowUpRight,
    isActive: isReturPembelianPath,
  },
] as const;

export function ReturModuleTabs() {
  const { locale } = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition -mb-px " +
              (active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")
            }
          >
            <Icon className="h-4 w-4" />
            {locale === "en" ? tab.labelEn : tab.labelId}
          </Link>
        );
      })}
    </div>
  );
}
