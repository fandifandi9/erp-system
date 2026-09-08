"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Warehouse } from "lucide-react";
import Link from "next/link";
import { WmsCard } from "@/components/wms/ui";
import { fetchProductStockOverview, type ProductWarehouseStockRow } from "@/lib/catalog/product-stock";
import type { WarehouseKind } from "@/lib/bisnis/warehouse-categories";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

type KindFilter = "all" | WarehouseKind;

type Props = {
  productId: string;
  isBundle: boolean;
};

const KIND_BADGE: Record<WarehouseKind, string> = {
  entity: "bg-violet-100 text-violet-800",
  sales: "bg-cyan-100 text-cyan-800",
  transit: "bg-amber-100 text-amber-800",
  damaged: "bg-rose-100 text-rose-800",
};

export function ProductStockSummary({ productId, isBundle }: Props) {
  const { t } = useLocale();
  const [rows, setRows] = useState<ProductWarehouseStockRow[]>([]);
  const [totals, setTotals] = useState({
    onHand: 0,
    available: 0,
    reserved: 0,
    sellableOnHand: 0,
    sellableAvailable: 0,
    damagedOnHand: 0,
  });
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        if (isBundle) {
          setRows([]);
          setTotals({ onHand: 0, available: 0, reserved: 0, sellableOnHand: 0, sellableAvailable: 0, damagedOnHand: 0 });
          return;
        }
        const overview = await fetchProductStockOverview(productId);
        if (!cancelled) {
          setRows(overview.rows);
          setTotals({
            onHand: overview.totalOnHand,
            available: overview.totalAvailable,
            reserved: overview.totalReserved,
            sellableOnHand: overview.sellableOnHand,
            sellableAvailable: overview.sellableAvailable,
            damagedOnHand: overview.damagedOnHand,
          });
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotals({
            onHand: 0,
            available: 0,
            reserved: 0,
            sellableOnHand: 0,
            sellableAvailable: 0,
            damagedOnHand: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, isBundle]);

  const filteredRows = useMemo(() => {
    if (kindFilter === "all") return rows;
    return rows.filter((r) => r.kind === kindFilter);
  }, [rows, kindFilter]);

  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = {
      all: rows.length,
      entity: 0,
      sales: 0,
      transit: 0,
      damaged: 0,
    };
    for (const r of rows) counts[r.kind]++;
    return counts;
  }, [rows]);

  const filterTabs: { key: KindFilter; label: string }[] = [
    { key: "all", label: t("catalog.produk.stockFilterAll") },
    { key: "entity", label: t("catalog.produk.stockFilterEntity") },
    { key: "sales", label: t("catalog.produk.stockFilterSales") },
    { key: "transit", label: t("catalog.produk.stockFilterTransit") },
    { key: "damaged", label: t("catalog.produk.stockFilterDamaged") },
  ];

  if (isBundle) {
    return (
      <WmsCard>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("catalog.produk.stockTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("catalog.produk.stockBundleHint")}</p>
        <Link
          href={`/katalog/bundling/${productId}`}
          className="mt-3 inline-flex text-sm font-semibold text-indigo-600 hover:underline"
        >
          {t("catalog.produk.manageBundling")}
        </Link>
      </WmsCard>
    );
  }

  return (
    <WmsCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("catalog.produk.stockTitle")}</h2>
          <p className="mt-1 text-xs text-slate-500">{t("catalog.produk.stockGlobalHint")}</p>
        </div>
        <Link
          href={`/gudang/stok?highlight=${productId}`}
          className="text-xs font-semibold text-indigo-600 hover:underline"
        >
          {t("catalog.produk.warehouseStock")}
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("catalog.produk.stockLoading")}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StockStat label={t("catalog.produk.stockOnHand")} value={totals.onHand} tone="indigo" />
            <StockStat label={t("catalog.produk.stockSellable")} value={totals.sellableOnHand} tone="cyan" />
            <StockStat label={t("catalog.produk.stockAvailable")} value={totals.sellableAvailable} tone="emerald" />
            <StockStat label={t("catalog.produk.stockDamaged")} value={totals.damagedOnHand} tone="rose" />
          </div>
          {totals.reserved > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {t("catalog.produk.stockReserved")}: {formatIntegerId(totals.reserved)}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <span className="inline-flex items-center gap-2">
              {detailOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              )}
              {t("catalog.produk.stockDetailToggle")}
            </span>
            <span className="text-xs font-normal text-slate-500">
              {formatIntegerId(rows.length)} {t("catalog.produk.stockWarehouse").toLowerCase()}
            </span>
          </button>

          {detailOpen ? (
            <>
          <div className="mt-3 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setKindFilter(tab.key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                  (kindFilter === tab.key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50")
                }
              >
                {tab.label}
                <span className="ml-1 opacity-75">({kindCounts[tab.key]})</span>
              </button>
            ))}
          </div>

          {filteredRows.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t("catalog.produk.stockWarehouse")}</th>
                    <th className="px-3 py-2">{t("catalog.produk.stockKind")}</th>
                    <th className="px-3 py-2 text-right">{t("catalog.produk.stockOnHand")}</th>
                    <th className="px-3 py-2 text-right">{t("catalog.produk.stockAvailable")}</th>
                    <th className="px-3 py-2 text-right">{t("catalog.produk.stockReserved")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((wh) => (
                    <tr key={wh.warehouseId} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-slate-800">
                          <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>
                            {wh.name}
                            <span className="ml-1 font-mono text-xs text-slate-400">{wh.code}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${KIND_BADGE[wh.kind]}`}
                        >
                          {wh.kindLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                        {formatIntegerId(wh.onHand)}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-medium tabular-nums " +
                          (wh.available < 0 ? "text-red-600" : "text-emerald-700")
                        }
                      >
                        {formatIntegerId(wh.available)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-amber-700">
                        {formatIntegerId(wh.reserved)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{t("catalog.produk.stockEmptyFilter")}</p>
          )}
            </>
          ) : null}
        </>
      )}
    </WmsCard>
  );
}

function StockStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "indigo" | "emerald" | "amber" | "cyan" | "rose";
}) {
  const tones = {
    indigo: "border-indigo-100 bg-indigo-50/60 text-indigo-900",
    emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-900",
    amber: "border-amber-100 bg-amber-50/60 text-amber-900",
    cyan: "border-cyan-100 bg-cyan-50/60 text-cyan-900",
    rose: "border-rose-100 bg-rose-50/60 text-rose-900",
  };
  return (
    <div className={`rounded-xl border px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatIntegerId(value)}</p>
    </div>
  );
}
