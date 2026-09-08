"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, RefreshCw, Warehouse } from "lucide-react";
import Link from "next/link";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchProductStockOverview,
  type ProductWarehouseStockRow,
} from "@/lib/catalog/product-stock";
import type { WarehouseKind } from "@/lib/bisnis/warehouse-categories";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  productId: string;
  isBundle: boolean;
  onOverviewLoaded?: (overview: import("@/lib/catalog/product-stock").ProductStockOverview) => void;
};

const KIND_ORDER: WarehouseKind[] = ["entity", "sales", "transit", "damaged"];

const KIND_BADGE: Record<WarehouseKind, string> = {
  entity: "bg-violet-100 text-violet-800",
  sales: "bg-cyan-100 text-cyan-800",
  transit: "bg-amber-100 text-amber-800",
  damaged: "bg-rose-100 text-rose-800",
};

function rowHasStock(wh: ProductWarehouseStockRow): boolean {
  return wh.onHand !== 0 || wh.available !== 0 || wh.reserved !== 0;
}

function sortWarehouseRows(a: ProductWarehouseStockRow, b: ProductWarehouseStockRow): number {
  const aStock = rowHasStock(a);
  const bStock = rowHasStock(b);
  if (aStock !== bStock) return aStock ? -1 : 1;
  const ki = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (ki !== 0) return ki;
  return a.code.localeCompare(b.code);
}

type CompanyStockGroup = {
  companyId: string;
  companyName: string;
  rows: ProductWarehouseStockRow[];
};

export function ProductStockSummary({ productId, isBundle, onOverviewLoaded }: Props) {
  const { t } = useLocale();
  const [rows, setRows] = useState<ProductWarehouseStockRow[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);
  const [reservedTotal, setReservedTotal] = useState(0);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadStock = useCallback(async (force = false) => {
    setLoading(true);
    try {
      if (isBundle) {
        setRows([]);
        setReadyTotal(0);
        setReservedTotal(0);
        return;
      }
      const overview = await fetchProductStockOverview(productId, { fresh: force });
      setRows(overview.rows);
      setReadyTotal(overview.totalOnHand);
      setReservedTotal(overview.totalReserved);
      onOverviewLoaded?.(overview);
    } catch {
      setRows([]);
      setReadyTotal(0);
      setReservedTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isBundle, productId, onOverviewLoaded]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  const companyGroups = useMemo(() => {
    const unknownLabel = t("catalog.produk.stockUnknownEntity");
    const byCompany = new Map<string, ProductWarehouseStockRow[]>();

    for (const row of rows) {
      const key = row.companyId ?? "__none__";
      const list = byCompany.get(key) ?? [];
      list.push(row);
      byCompany.set(key, list);
    }

    const groups: CompanyStockGroup[] = [];

    for (const [companyId, allRows] of byCompany) {
      const visible = (hideEmpty ? allRows.filter(rowHasStock) : allRows).slice().sort(sortWarehouseRows);
      if (hideEmpty && visible.length === 0) continue;

      const companyName =
        allRows.find((r) => r.companyName)?.companyName ??
        (companyId === "__none__" ? unknownLabel : companyId);

      groups.push({ companyId, companyName, rows: visible });
    }

    groups.sort((a, b) => {
      const aStock = a.rows.some(rowHasStock);
      const bStock = b.rows.some(rowHasStock);
      if (aStock !== bStock) return aStock ? -1 : 1;
      return a.companyName.localeCompare(b.companyName, "id");
    });

    return groups;
  }, [rows, hideEmpty, t]);

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
          <p className="mt-1 text-xs text-slate-500">{t("catalog.produk.stockReadyHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadStock(true)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("catalog.produk.stockRefresh")}
          </button>
          <Link
            href={`/gudang/stok?highlight=${productId}`}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            {t("catalog.produk.warehouseStock")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("catalog.produk.stockLoading")}
        </div>
      ) : (
        <>
          <div className="mt-4 max-w-xs">
            <StockStat label={t("catalog.produk.stockReady")} value={readyTotal} tone="indigo" />
          </div>
          {reservedTotal > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              {t("catalog.produk.stockReserved")}: {formatIntegerId(reservedTotal)}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("catalog.produk.stockByCompany")}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(e) => setHideEmpty(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t("catalog.produk.stockHideEmpty")}
            </label>
          </div>

          {companyGroups.length > 0 ? (
            <div className="mt-3 space-y-4">
              {companyGroups.map((group) => (
                <CompanyStockGroupCard key={group.companyId} group={group} t={t} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {hideEmpty ? t("catalog.produk.stockNoStockInKind") : t("catalog.produk.stockEmpty")}
            </p>
          )}
        </>
      )}
    </WmsCard>
  );
}

function CompanyStockGroupCard({
  group,
  t,
}: {
  group: CompanyStockGroup;
  t: (path: string, vars?: Record<string, string | number | undefined>) => string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">{group.companyName}</h3>
        </div>
        <span className="text-xs text-slate-500">
          {t("catalog.produk.stockGroupWarehouses", { count: group.rows.length })}
        </span>
      </div>

      {group.rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr className="border-t border-slate-100">
                <th className="px-3 py-2">{t("catalog.produk.stockKind")}</th>
                <th className="px-3 py-2">{t("catalog.produk.stockWarehouse")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.produk.stockQty")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.produk.stockAvailable")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.produk.stockReserved")}</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((wh) => (
                <tr
                  key={wh.warehouseId}
                  className={"border-t border-slate-100 " + (rowHasStock(wh) ? "bg-emerald-50/40" : "opacity-60")}
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${KIND_BADGE[wh.kind]}`}
                    >
                      {wh.kindLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-800">
                      <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        <span className="font-mono text-xs text-slate-500">{wh.code}</span>
                        <span className="ml-1">{wh.name}</span>
                        {wh.storeName ? (
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {t("catalog.produk.stockStoreLabel")}: {wh.storeName}
                          </span>
                        ) : null}
                      </span>
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
        <p className="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">{t("catalog.produk.stockGroupEmpty")}</p>
      )}
    </section>
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
