"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown, Receipt, Truck } from "lucide-react";
import { purchaseCreateUrl } from "@/lib/bisnis/module-routes";
import { useLocale } from "@/components/LocaleProvider";

export function PurchaseModuleHeader() {
  const { t } = useLocale();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("purchase.list.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("purchase.list.subtitle")}</p>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t("purchase.list.newPurchase")}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {dropdownOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <Link
                href={purchaseCreateUrl("bill")}
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Receipt className="h-4 w-4 text-slate-400" />
                {t("purchase.list.purchaseBill")}
              </Link>
              <Link
                href={purchaseCreateUrl("po")}
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Truck className="h-4 w-4 text-slate-400" />
                {t("purchase.list.purchaseOrder")}
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
