"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt, Truck } from "lucide-react";
import {
  PURCHASE_MODULE,
  isPurchaseTagihanPath,
  isPurchasePesananPath,
} from "@/lib/bisnis/module-routes";
import { useLocale } from "@/components/LocaleProvider";

const TABS = [
  { href: PURCHASE_MODULE.tagihan, key: "purchase.list.billing", icon: Receipt, isActive: isPurchaseTagihanPath },
  { href: PURCHASE_MODULE.pesanan, key: "purchase.list.orders", icon: Truck, isActive: isPurchasePesananPath },
] as const;

export function PurchaseModuleTabs() {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
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
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")
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
