"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Search,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import { fetchProductStorePrices, saveProductStorePrice } from "@/lib/catalog/client";
import { mergeProductStorePrices, type ProductStorePriceRow } from "@/lib/catalog/product-store-prices";
import {
  fetchProductModalCostByEntity,
  type EntityModalCostRow,
} from "@/lib/catalog/product-modal-cost";
import {
  groupWholesaleTiersByStore,
  tierQtyRangeLabelWithUnit,
  type WholesaleTierRow,
} from "@/lib/catalog/wholesale-prices";
import {
  deleteProductPriceTier,
  fetchProductPriceTiers,
  saveProductPriceTier,
} from "@/lib/inventory/client";
import { fetchSalesStores } from "@/lib/bisnis/client";
import type { Store } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

type PriceFilter = "all" | "unset";

type StorePricingGroup = {
  store: Store;
  retail: ProductStorePriceRow;
  tiers: WholesaleTierRow[];
};

export function ProductPricingPanel({
  productId,
  globalSellPrice,
  canEdit,
  uom = "pcs",
  showBuyPrice = false,
  embedded = false,
}: {
  productId: string;
  globalSellPrice?: number;
  canEdit: boolean;
  uom?: string;
  showBuyPrice?: boolean;
  embedded?: boolean;
}) {
  const { t } = useLocale();
  const [groups, setGroups] = useState<StorePricingGroup[]>([]);
  const [entityCosts, setEntityCosts] = useState<EntityModalCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storeQuery, setStoreQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);
  const [savingTierId, setSavingTierId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stores, priceRes, tiers, modalCosts] = await Promise.all([
        fetchSalesStores(),
        fetchProductStorePrices(productId),
        fetchProductPriceTiers(productId),
        showBuyPrice ? fetchProductModalCostByEntity(productId) : Promise.resolve([]),
      ]);
      const retailRows = mergeProductStorePrices(stores, priceRes.items ?? []);
      const retailByStore = new Map(retailRows.map((r) => [r.storeId, r]));
      const wholesaleGroups = groupWholesaleTiersByStore(stores, tiers);

      setGroups(
        wholesaleGroups.map(({ store, tiers: storeTiers }) => ({
          store,
          retail: retailByStore.get(store.id)!,
          tiers: storeTiers,
        })),
      );
      setEntityCosts(modalCosts);
    } catch (e) {
      setError(getErrorMessage(e));
      setGroups([]);
      setEntityCosts([]);
    } finally {
      setLoading(false);
    }
  }, [productId, showBuyPrice]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGroups = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    return groups.filter(({ store, retail, tiers }) => {
      if (priceFilter === "unset") {
        const retailUnset = !retail.hasOverride || retail.sellPrice === 0;
        const wholesaleUnset = tiers.length === 0;
        if (!retailUnset && !wholesaleUnset) return false;
      }
      if (!q) return true;
      return (
        store.name.toLowerCase().includes(q) ||
        (store.code?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [groups, storeQuery, priceFilter]);

  const unsetCount = useMemo(
    () =>
      groups.filter(
        (g) => !g.retail.hasOverride || g.retail.sellPrice === 0 || g.tiers.length === 0,
      ).length,
    [groups],
  );

  const saveRetail = async (row: ProductStorePriceRow, sellPrice: number) => {
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

  const saveTier = async (
    storeId: string,
    tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number },
  ) => {
    setSavingTierId(tier.id ?? `new-${storeId}`);
    setError("");
    try {
      await saveProductPriceTier({
        id: tier.id,
        product: productId,
        store: storeId,
        min_qty: tier.min_qty,
        max_qty: tier.max_qty,
        price: tier.price,
      });
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingTierId(null);
    }
  };

  const removeTier = async (tier: WholesaleTierRow) => {
    if (!window.confirm(t("catalog.harga.wholesaleConfirmDelete"))) return;
    setSavingTierId(tier.id);
    setError("");
    try {
      await deleteProductPriceTier(tier.id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingTierId(null);
    }
  };

  return (
    <PricingPanelShell embedded={embedded}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t("catalog.harga.pricingPanelTitle")}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {t("catalog.harga.pricingPanelHint", { price: fmt.format(globalSellPrice ?? 0) })}
        </p>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {showBuyPrice ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">{t("catalog.harga.modalCostTitle")}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t("catalog.harga.modalCostHint")}</p>
            </div>
          </div>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("catalog.harga.loadingPrices")}
            </div>
          ) : entityCosts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("catalog.harga.modalCostEmpty")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t("catalog.harga.modalCostEntity")}</th>
                    <th className="px-3 py-2 text-right">{t("catalog.harga.modalCostCost")}</th>
                    <th className="px-3 py-2">{t("catalog.harga.modalCostSource")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entityCosts.map((row) => (
                    <tr key={row.companyId} className="border-t border-slate-100">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-800">{row.companyName}</span>
                        {row.companyCode ? (
                          <span className="ml-1.5 font-mono text-xs text-slate-400">{row.companyCode}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {row.hasPurchase ? fmt.format(row.unitCost) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {row.hasPurchase && row.poNo ? (
                          <span>
                            PO {row.poNo}
                            {row.orderDate ? ` · ${row.orderDate}` : ""}
                          </span>
                        ) : (
                          t("catalog.harga.modalCostNoPurchase")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
            count={groups.length}
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
      ) : filteredGroups.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("catalog.harga.emptyStoreFilter")}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {filteredGroups.map(({ store, retail, tiers }) => (
            <StorePricingSection
              key={store.id}
              store={store}
              retail={retail}
              tiers={tiers}
              globalSellPrice={globalSellPrice ?? 0}
              uom={uom}
              canEdit={canEdit}
              expanded={expandedStoreId === store.id}
              savingRetail={savingStoreId === store.id}
              savingTierId={savingTierId}
              onToggle={() => setExpandedStoreId((cur) => (cur === store.id ? null : store.id))}
              onSaveRetail={(price) => void saveRetail(retail, price)}
              onSaveTier={(tier) => void saveTier(store.id, tier)}
              onDeleteTier={(tier) => void removeTier(tier)}
            />
          ))}
        </div>
      )}
    </PricingPanelShell>
  );
}

function PricingPanelShell({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}) {
  if (embedded) {
    return <div className="space-y-4">{children}</div>;
  }
  return <WmsCard>{children}</WmsCard>;
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

function StorePricingSection({
  store,
  retail,
  tiers,
  globalSellPrice,
  uom,
  canEdit,
  expanded,
  savingRetail,
  savingTierId,
  onToggle,
  onSaveRetail,
  onSaveTier,
  onDeleteTier,
}: {
  store: Store;
  retail: ProductStorePriceRow;
  tiers: WholesaleTierRow[];
  globalSellPrice: number;
  uom: string;
  canEdit: boolean;
  expanded: boolean;
  savingRetail: boolean;
  savingTierId: string | null;
  onToggle: () => void;
  onSaveRetail: (price: number) => void;
  onSaveTier: (tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number }) => void;
  onDeleteTier: (tier: WholesaleTierRow) => void;
}) {
  const { t } = useLocale();
  const effectiveRetail =
    retail.hasOverride && retail.sellPrice > 0 ? retail.sellPrice : globalSellPrice;
  const wholesalePreview =
    tiers.length > 0
      ? tiers
          .slice(0, 2)
          .map((tier) => {
            const range = tierQtyRangeLabelWithUnit(tier.min_qty, tier.max_qty, uom);
            return `${range} ${fmt.format(tier.price)}`;
          })
          .join(" · ")
      : t("catalog.harga.wholesaleUnset");

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-slate-50/80 px-3 py-2.5 text-left hover:bg-slate-100/80"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <StoreIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {store.name}
            {store.code ? (
              <span className="font-mono text-xs font-normal text-slate-400">{store.code}</span>
            ) : null}
          </p>
          {!expanded ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {t("catalog.harga.retailSection")}: {fmt.format(effectiveRetail)} ·{" "}
              {t("catalog.harga.wholesaleSection")}: {wholesalePreview}
            </p>
          ) : null}
        </div>
        {tiers.length > 0 ? (
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {tiers.length} tier
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-slate-200 bg-white p-3">
          <RetailSection
            retail={retail}
            globalSellPrice={globalSellPrice}
            canEdit={canEdit}
            saving={savingRetail}
            onSave={onSaveRetail}
          />
          <WholesaleSection
            storeId={store.id}
            tiers={tiers}
            uom={uom}
            canEdit={canEdit}
            savingTierId={savingTierId}
            onSave={onSaveTier}
            onDelete={onDeleteTier}
          />
        </div>
      ) : null}
    </div>
  );
}

function RetailSection({
  retail,
  globalSellPrice,
  canEdit,
  saving,
  onSave,
}: {
  retail: ProductStorePriceRow;
  globalSellPrice: number;
  canEdit: boolean;
  saving: boolean;
  onSave: (price: number) => void;
}) {
  const { t } = useLocale();
  const [price, setPrice] = useState(retail.sellPrice);
  useEffect(() => {
    setPrice(retail.sellPrice);
  }, [retail.sellPrice, retail.storeId]);

  const dirty = price !== retail.sellPrice;
  const effective = retail.hasOverride && retail.sellPrice > 0 ? retail.sellPrice : globalSellPrice;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("catalog.harga.retailSection")}
      </p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right">{t("catalog.harga.colGlobal")}</th>
              <th className="px-3 py-2 text-right">{t("catalog.harga.colStore")}</th>
              {canEdit ? <th className="px-3 py-2 text-right">{t("catalog.common.actions")}</th> : null}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                {fmt.format(globalSellPrice)}
              </td>
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
                    {retail.hasOverride ? fmt.format(retail.sellPrice) : "—"}
                  </span>
                )}
                {canEdit && !retail.hasOverride && price === 0 ? (
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
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {t("catalog.common.save")}
                  </button>
                </td>
              ) : null}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WholesaleSection({
  storeId,
  tiers,
  uom,
  canEdit,
  savingTierId,
  onSave,
  onDelete,
}: {
  storeId: string;
  tiers: WholesaleTierRow[];
  uom: string;
  canEdit: boolean;
  savingTierId: string | null;
  onSave: (tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number }) => void;
  onDelete: (tier: WholesaleTierRow) => void;
}) {
  const { t } = useLocale();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("catalog.harga.wholesaleSection")}
      </p>
      {tiers.length > 0 ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("catalog.harga.wholesaleFrom")}</th>
                <th className="px-3 py-2">{t("catalog.harga.wholesaleTo")}</th>
                <th className="px-3 py-2 text-right">{t("catalog.harga.wholesalePricePerUnit")}</th>
                {canEdit ? <th className="px-3 py-2 text-right">{t("catalog.common.actions")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <TierRow
                  key={tier.id}
                  tier={tier}
                  canEdit={canEdit}
                  saving={savingTierId === tier.id}
                  onSave={onSave}
                  onDelete={() => onDelete(tier)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{t("catalog.harga.wholesaleEmptyStore")}</p>
      )}
      {canEdit ? (
        <AddTierForm
          storeId={storeId}
          saving={savingTierId === `new-${storeId}`}
          onAdd={onSave}
        />
      ) : null}
    </div>
  );
}

function TierRow({
  tier,
  canEdit,
  saving,
  onSave,
  onDelete,
}: {
  tier: WholesaleTierRow;
  canEdit: boolean;
  saving: boolean;
  onSave: (tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number }) => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  const [minQty, setMinQty] = useState(String(tier.min_qty));
  const [maxQty, setMaxQty] = useState(String(tier.max_qty ?? tier.min_qty));
  const [price, setPrice] = useState(tier.price);

  useEffect(() => {
    setMinQty(String(tier.min_qty));
    setMaxQty(String(tier.max_qty ?? tier.min_qty));
    setPrice(tier.price);
  }, [tier]);

  const dirty =
    parseIntegerInput(minQty) !== tier.min_qty ||
    parseIntegerInput(maxQty) !== (tier.max_qty ?? tier.min_qty) ||
    price !== tier.price;

  if (!canEdit) {
    return (
      <tr className="border-t border-slate-100">
        <td className="px-3 py-2 tabular-nums">{formatIntegerId(tier.min_qty)}</td>
        <td className="px-3 py-2 tabular-nums">{formatIntegerId(tier.max_qty ?? tier.min_qty)}</td>
        <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt.format(tier.price)}</td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">
        <QtyInput value={minQty} onChange={setMinQty} />
      </td>
      <td className="px-3 py-2">
        <QtyInput value={maxQty} onChange={setMaxQty} />
      </td>
      <td className="px-3 py-2">
        <PosMoneyInput
          value={price}
          onChange={setPrice}
          inputClassName="!w-full !min-w-[120px] !rounded-md !py-1.5 !text-sm !text-right"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() =>
              onSave({
                id: tier.id,
                min_qty: parseIntegerInput(minQty),
                max_qty: parseIntegerInput(maxQty),
                price,
              })
            }
            className="rounded-md bg-indigo-600 p-1.5 text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddTierForm({
  storeId,
  saving,
  onAdd,
}: {
  storeId: string;
  saving: boolean;
  onAdd: (tier: { min_qty: number; max_qty?: number; price: number }) => void;
}) {
  const { t } = useLocale();
  const [minQty, setMinQty] = useState("1");
  const [maxQty, setMaxQty] = useState("1");
  const [price, setPrice] = useState(0);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
      <label className="w-20 text-sm">
        <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
          {t("catalog.harga.wholesaleFrom")}
        </span>
        <QtyInput value={minQty} onChange={setMinQty} />
      </label>
      <label className="w-20 text-sm">
        <span className="mb-1 block text-[10px] font-medium uppercase text-slate-500">
          {t("catalog.harga.wholesaleTo")}
        </span>
        <QtyInput value={maxQty} onChange={setMaxQty} />
      </label>
      <div className="w-36">
        <PosMoneyInput
          label={t("catalog.harga.wholesalePricePerUnit")}
          value={price}
          onChange={setPrice}
          inputClassName="!rounded-md !py-1.5 !text-sm"
        />
      </div>
      <button
        type="button"
        disabled={saving || price <= 0}
        onClick={() =>
          onAdd({
            min_qty: parseIntegerInput(minQty),
            max_qty: parseIntegerInput(maxQty),
            price,
          })
        }
        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t("catalog.common.add")}
      </button>
    </div>
  );
}

function QtyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value ? formatIntegerId(parseIntegerInput(value)) : ""}
      onChange={(e) => onChange(String(parseIntegerInput(e.target.value)))}
      inputMode="numeric"
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-right"
    />
  );
}
