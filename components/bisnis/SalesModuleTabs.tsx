"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt, ShoppingBag } from "lucide-react";
import {
  SALES_MODULE,
  isSalesPenagihanPath,
  isSalesPesananPath,
} from "@/lib/bisnis/module-routes";
import { useLocale } from "@/components/LocaleProvider";

const TABS = [
  { href: SALES_MODULE.penagihan, key: "sales.list.billing", icon: Receipt, isActive: isSalesPenagihanPath },
  { href: SALES_MODULE.pesanan, key: "sales.list.orders", icon: ShoppingBag, isActive: isSalesPesananPath },
] as const;

export function SalesModuleTabs({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <div
      className={
        embedded
          ? "mr-2 flex shrink-0 flex-wrap gap-1 border-r border-slate-200 pr-3"
          : "flex flex-wrap gap-1 border-b border-slate-200"
      }
    >
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
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
