"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Search, Store as StoreIcon } from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import { fetchProductStorePrices, saveProductStorePrice } from "@/lib/catalog/client";
import { mergeProductStorePrices, type ProductStorePriceRow } from "@/lib/catalog/product-store-prices";
import { fetchSalesStores } from "@/lib/bisnis/client";
import { getErrorMessage } from "@/lib/errors";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

type PriceFilter = "all" | "unset";

export function StorePriceEditor({
  productId,
  globalSellPrice,
  canEdit,
}: {
  productId: string;
  globalSellPrice?: number;
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [rows, setRows] = useState<ProductStorePriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stores, res] = await Promise.all([
        fetchSalesStores(),
        fetchProductStorePrices(productId),
      ]);
      setRows(mergeProductStorePrices(stores, res.items ?? []));
    } catch (e) {
      setError(getErrorMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (priceFilter === "unset" && row.hasOverride && row.sellPrice > 0) return false;
      if (!q) return true;
      return (
        row.storeName.toLowerCase().includes(q) ||
        (row.storeCode?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, storeQuery, priceFilter]);

  const unsetCount = useMemo(
    () => rows.filter((r) => !r.hasOverride || r.sellPrice === 0).length,
    [rows],
  );

  const saveRow = async (row: ProductStorePriceRow, sellPrice: number) => {
    setSavingStoreId(row.storeId);
    setError("");
    try {
      if (sellPrice <= 0) {
        if (row.priceRowId) {
          await saveProductStorePrice(productId, { deletePriceId: row.priceRowId });
        }
      } else {
        await saveProductStorePrice(productId, {
          storeId: row.storeId,
          sellPrice,
        });
      }
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingStoreId(null);
    }
  };

  return (
    <WmsCard>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t("catalog.harga.storePricesTitle")}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t("catalog.harga.storePricesAllHint", { price: fmt.format(globalSellPrice ?? 0) })}
        </p>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            placeholder={t("catalog.harga.filterStorePlaceholder")}
            className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <FilterChip
            active={priceFilter === "all"}
            onClick={() => setPriceFilter("all")}
            label={t("catalog.harga.filterAllStores")}
            count={rows.length}
          />
          <FilterChip
            active={priceFilter === "unset"}
            onClick={() => setPriceFilter("unset")}
            label={t("catalog.harga.filterUnsetPrice")}
            count={unsetCount}
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("catalog.harga.loadingPrices")}
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("catalog.harga.emptyStoreFilter")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("catalog.harga.store")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.harga.colGlobal")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.harga.colStore")}</th>
                {canEdit ? <th className="px-3 py-2 text-right">{t("catalog.common.actions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <StorePriceTableRow
                  key={row.storeId}
                  row={row}
                  globalSellPrice={globalSellPrice ?? 0}
                  canEdit={canEdit}
                  saving={savingStoreId === row.storeId}
                  onSave={(price) => void saveRow(row, price)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WmsCard>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
        (active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50")
      }
    >
      {label}
      <span className="ml-1 opacity-75">({formatIntegerId(count)})</span>
    </button>
  );
}

function StorePriceTableRow({
  row,
  globalSellPrice,
  canEdit,
  saving,
  onSave,
}: {
  row: ProductStorePriceRow;
  globalSellPrice: number;
  canEdit: boolean;
  saving: boolean;
  onSave: (price: number) => void;
}) {
  const { t } = useLocale();
  const [price, setPrice] = useState(row.sellPrice);
  useEffect(() => {
    setPrice(row.sellPrice);
  }, [row.sellPrice, row.storeId]);

  const dirty = price !== row.sellPrice;
  const effective = row.hasOverride && row.sellPrice > 0 ? row.sellPrice : globalSellPrice;

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
          <StoreIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {row.storeName}
          {row.storeCode ? (
            <span className="font-mono text-xs font-normal text-slate-400">{row.storeCode}</span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt.format(globalSellPrice)}</td>
      <td className="px-3 py-2.5 text-right">
        {canEdit ? (
          <div className="ml-auto max-w-[140px]">
            <PosMoneyInput
              value={price}
              onChange={setPrice}
              inputClassName="!rounded-md !py-1.5 !text-sm !text-right"
            />
          </div>
        ) : (
          <span className="font-semibold tabular-nums text-slate-900">
            {row.hasOverride ? fmt.format(row.sellPrice) : "—"}
          </span>
        )}
        {!canEdit && row.hasOverride ? null : !canEdit ? (
          <span className="mt-0.5 block text-[10px] text-slate-400">
            {t("catalog.harga.usesGlobal")}
          </span>
        ) : null}
        {canEdit && !row.hasOverride && price === 0 ? (
          <span className="mt-0.5 block text-[10px] text-slate-400">
            {t("catalog.harga.usesGlobalShort")} · {fmt.format(effective)}
          </span>
        ) : null}
      </td>
      {canEdit ? (
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(price)}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t("catalog.common.save")}
          </button>
        </td>
      ) : null}
    </tr>
  );
}
