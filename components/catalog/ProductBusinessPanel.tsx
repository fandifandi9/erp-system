"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchProductStorePrices,
  saveProductStorePrice,
  updateCatalogProduct,
} from "@/lib/catalog/client";
import { mergeProductStorePrices, type ProductStorePriceRow } from "@/lib/catalog/product-store-prices";
import {
  fetchProductStockByStore,
  fetchProductsGlobalStock,
} from "@/lib/catalog/product-stock";
import { isProductLowStock } from "@/lib/catalog/product-last-sale";
import { fetchSalesStores } from "@/lib/bisnis/client";
import type { CatalogProduct } from "@/lib/catalog/types";
import { getErrorMessage } from "@/lib/errors";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

type StoreRow = ProductStorePriceRow & { stock: number };

export function ProductBusinessPanel({
  product,
  canEditPrices,
  showBuyPrice,
  onSaved,
  onEditWholesale,
}: {
  product: CatalogProduct;
  canEditPrices: boolean;
  showBuyPrice: boolean;
  onSaved: () => void | Promise<void>;
  onEditWholesale?: () => void;
}) {
  const { t } = useLocale();
  const isBundle = (product.product_type ?? "simple") === "bundle";

  const [globalStock, setGlobalStock] = useState(0);
  const [storeRows, setStoreRows] = useState<StoreRow[]>([]);
  const [sellPrice, setSellPrice] = useState(product.sell_price ?? 0);
  const [buyPrice, setBuyPrice] = useState(product.buy_price ?? 0);
  const [storePrices, setStorePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isBundle) {
        setGlobalStock(0);
        setStoreRows([]);
        setSellPrice(product.sell_price ?? 0);
        setBuyPrice(product.buy_price ?? 0);
        return;
      }
      const [stores, priceRes, globalMap, stockByStore] = await Promise.all([
        fetchSalesStores(),
        fetchProductStorePrices(product.id),
        fetchProductsGlobalStock([product.id]),
        fetchProductStockByStore(product.id),
      ]);
      const retail = mergeProductStorePrices(stores, priceRes.items ?? []);
      const rows: StoreRow[] = retail.map((r) => ({
        ...r,
        stock: stockByStore[r.storeId] ?? 0,
      }));
      setStoreRows(rows);
      setGlobalStock(globalMap[product.id] ?? 0);
      setSellPrice(product.sell_price ?? 0);
      setBuyPrice(product.buy_price ?? 0);
      const drafts: Record<string, number> = {};
      for (const r of rows) drafts[r.storeId] = r.sellPrice;
      setStorePrices(drafts);
    } catch (e) {
      setError(getErrorMessage(e));
      setStoreRows([]);
    } finally {
      setLoading(false);
    }
  }, [product.id, product.sell_price, product.buy_price, isBundle]);

  useEffect(() => {
    void load();
  }, [load]);

  const lowStock = !isBundle && isProductLowStock(globalStock, product.min_stock);

  const saveGlobal = async () => {
    setSavingGlobal(true);
    setError("");
    try {
      await updateCatalogProduct(product.id, {
        sell_price: sellPrice,
        ...(showBuyPrice ? { buy_price: buyPrice } : {}),
      });
      await onSaved();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingGlobal(false);
    }
  };

  const saveStore = async (row: StoreRow) => {
    const price = storePrices[row.storeId] ?? 0;
    setSavingStoreId(row.storeId);
    setError("");
    try {
      if (price <= 0) {
        if (row.priceRowId) {
          await saveProductStorePrice(product.id, { deletePriceId: row.priceRowId });
        }
      } else {
        await saveProductStorePrice(product.id, {
          storeId: row.storeId,
          sellPrice: price,
        });
      }
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingStoreId(null);
    }
  };

  const globalDirty =
    sellPrice !== (product.sell_price ?? 0) ||
    (showBuyPrice && buyPrice !== (product.buy_price ?? 0));

  return (
    <WmsCard>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {t("catalog.produk.businessPanelTitle")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("catalog.produk.businessPanelHint")}</p>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("catalog.produk.businessLoading")}
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoBox label={t("catalog.produk.colSellPrice")}>
              {canEditPrices ? (
                <PosMoneyInput
                  value={sellPrice}
                  onChange={setSellPrice}
                  inputClassName="!rounded-lg !border-slate-200 !py-2 !text-sm !font-semibold"
                />
              ) : (
                <span className="text-sm font-semibold tabular-nums">
                  {sellPrice ? fmt.format(sellPrice) : "—"}
                </span>
              )}
            </InfoBox>
            {showBuyPrice ? (
              <InfoBox label={t("catalog.produk.buyPriceMaster")}>
                {canEditPrices ? (
                  <PosMoneyInput
                    value={buyPrice}
                    onChange={setBuyPrice}
                    inputClassName="!rounded-lg !border-slate-200 !py-2 !text-sm !font-semibold"
                  />
                ) : (
                  <span className="text-sm font-semibold tabular-nums">
                    {buyPrice ? fmt.format(buyPrice) : "—"}
                  </span>
                )}
              </InfoBox>
            ) : null}
            <InfoBox label={t("catalog.produk.colGlobalStock")} warn={lowStock}>
              <span
                className={
                  "text-sm font-semibold tabular-nums " + (lowStock ? "text-rose-700" : "text-slate-900")
                }
              >
                {isBundle ? "—" : formatIntegerId(globalStock)}
              </span>
              {!isBundle && (product.min_stock ?? 0) > 0 ? (
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  min {formatIntegerId(product.min_stock ?? 0)}
                </span>
              ) : null}
            </InfoBox>
          </dl>

          {canEditPrices && globalDirty ? (
            <button
              type="button"
              disabled={savingGlobal}
              onClick={() => void saveGlobal()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {savingGlobal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {t("catalog.produk.saveGlobalPrices")}
            </button>
          ) : null}

          {!isBundle && storeRows.length > 0 ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("catalog.produk.perStoreSection")}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {storeRows.map((row) => {
                  const draft = storePrices[row.storeId] ?? 0;
                  const dirty = draft !== row.sellPrice;
                  const effective =
                    row.hasOverride && row.sellPrice > 0 ? row.sellPrice : sellPrice;
                  return (
                    <div
                      key={row.storeId}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {row.storeName}
                        {row.storeCode ? (
                          <span className="ml-1.5 font-mono text-xs font-normal text-slate-400">
                            {row.storeCode}
                          </span>
                        ) : null}
                      </p>
                      <dl className="mt-2 grid grid-cols-2 gap-2">
                        <InfoBox label={t("catalog.produk.storeStock")} compact>
                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatIntegerId(row.stock)}
                          </span>
                        </InfoBox>
                        <InfoBox label={t("catalog.harga.colStore")} compact>
                          {canEditPrices ? (
                            <PosMoneyInput
                              value={draft}
                              onChange={(v) =>
                                setStorePrices((prev) => ({ ...prev, [row.storeId]: v }))
                              }
                              inputClassName="!rounded-md !py-1.5 !text-sm !font-semibold"
                            />
                          ) : (
                            <span className="text-sm font-semibold tabular-nums">
                              {row.hasOverride ? fmt.format(row.sellPrice) : fmt.format(effective)}
                            </span>
                          )}
                          {canEditPrices && !row.hasOverride && draft === 0 ? (
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {t("catalog.harga.usesGlobalShort")} · {fmt.format(effective)}
                            </span>
                          ) : null}
                        </InfoBox>
                      </dl>
                      {canEditPrices && dirty ? (
                        <button
                          type="button"
                          disabled={savingStoreId === row.storeId}
                          onClick={() => void saveStore(row)}
                          className="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {savingStoreId === row.storeId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          {t("catalog.common.save")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {onEditWholesale && canEditPrices ? (
            <button
              type="button"
              onClick={onEditWholesale}
              className="mt-4 text-xs font-semibold text-indigo-600 hover:underline"
            >
              {t("catalog.produk.pricingEditCta")} →
            </button>
          ) : null}
        </>
      )}
    </WmsCard>
  );
}

function InfoBox({
  label,
  children,
  warn,
  compact,
}: {
  label: string;
  children: ReactNode;
  warn?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border bg-white px-3 py-2.5 " +
        (warn ? "border-rose-200 bg-rose-50/50" : "border-slate-200") +
        (compact ? "" : "")
      }
    >
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
