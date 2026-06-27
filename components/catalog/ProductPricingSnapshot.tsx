"use client";

import { Banknote, Pencil } from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import { useLocale } from "@/components/LocaleProvider";

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function ProductPricingSnapshot({
  globalSellPrice,
  buyPrice,
  showBuyPrice,
  canEdit,
  onEditPricing,
}: {
  globalSellPrice?: number;
  buyPrice?: number;
  showBuyPrice?: boolean;
  canEdit?: boolean;
  onEditPricing?: () => void;
}) {
  const { t } = useLocale();

  return (
    <WmsCard>
      <div className="flex items-start gap-3">
        <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{t("catalog.produk.pricingSnapshotTitle")}</h3>
          <p className="mt-1 text-xs text-slate-500">{t("catalog.produk.pricingTemplateHint")}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("catalog.harga.colGlobal")}
          </dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {globalSellPrice ? fmt.format(globalSellPrice) : "—"}
          </dd>
        </div>
        {showBuyPrice ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t("catalog.produk.buyPriceMaster")}
            </dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
              {buyPrice ? fmt.format(buyPrice) : "—"}
            </dd>
          </div>
        ) : null}
      </dl>

      {canEdit && onEditPricing ? (
        <button
          type="button"
          onClick={onEditPricing}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t("catalog.produk.pricingEditCta")}
        </button>
      ) : null}
    </WmsCard>
  );
}
