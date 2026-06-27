"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import {
  deleteProductPriceTier,
  fetchProductPriceTiers,
  saveProductPriceTier,
} from "@/lib/inventory/client";
import { fetchSalesStores } from "@/lib/bisnis/client";
import type { Store } from "@/lib/bisnis/types";
import {
  groupWholesaleTiersByStore,
  tierQtyRangeLabelWithUnit,
  type WholesaleTierRow,
} from "@/lib/catalog/wholesale-prices";
import { getErrorMessage } from "@/lib/errors";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

const fmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export function WholesalePriceEditor({
  productId,
  canEdit,
  uom = "pcs",
}: {
  productId: string;
  canEdit: boolean;
  uom?: string;
}) {
  const { t } = useLocale();
  const [groups, setGroups] = useState<Array<{ store: Store; tiers: WholesaleTierRow[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [stores, tiers] = await Promise.all([
        fetchSalesStores(),
        fetchProductPriceTiers(productId),
      ]);
      setGroups(groupWholesaleTiersByStore(stores, tiers));
    } catch (e) {
      setError(getErrorMessage(e));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const storesWithTiers = useMemo(() => groups.filter((g) => g.tiers.length > 0).length, [groups]);

  const saveTier = async (
    storeId: string,
    tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number },
  ) => {
    setSavingId(tier.id ?? `new-${storeId}`);
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
      setSavingId(null);
    }
  };

  const removeTier = async (tier: WholesaleTierRow) => {
    if (!window.confirm(t("catalog.harga.wholesaleConfirmDelete"))) return;
    setSavingId(tier.id);
    setError("");
    try {
      await deleteProductPriceTier(tier.id);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <WmsCard>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{t("catalog.harga.wholesaleTitle")}</h3>
        <p className="mt-1 text-xs text-slate-500">{t("catalog.harga.wholesalePerStoreHint")}</p>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("catalog.harga.loadingPrices")}
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("catalog.harga.wholesaleNoStores")}</p>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-slate-500">
            {t("catalog.harga.wholesaleStoreSummary", {
              stores: String(groups.length),
              configured: String(storesWithTiers),
            })}
          </p>
          {groups.map(({ store, tiers }) => (
            <StoreWholesaleSection
              key={store.id}
              store={store}
              tiers={tiers}
              uom={uom}
              canEdit={canEdit}
              expanded={expandedStoreId === store.id}
              savingId={savingId}
              onToggle={() =>
                setExpandedStoreId((cur) => (cur === store.id ? null : store.id))
              }
              onSave={(tier) => void saveTier(store.id, tier)}
              onDelete={(tier) => void removeTier(tier)}
            />
          ))}
        </div>
      )}
    </WmsCard>
  );
}

function StoreWholesaleSection({
  store,
  tiers,
  uom,
  canEdit,
  expanded,
  savingId,
  onToggle,
  onSave,
  onDelete,
}: {
  store: Store;
  tiers: WholesaleTierRow[];
  uom: string;
  canEdit: boolean;
  expanded: boolean;
  savingId: string | null;
  onToggle: () => void;
  onSave: (tier: Partial<WholesaleTierRow> & { min_qty: number; max_qty?: number; price: number }) => void;
  onDelete: (tier: WholesaleTierRow) => void;
}) {
  const { t } = useLocale();
  const preview =
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
          <p className="text-sm font-semibold text-slate-800">{store.name}</p>
          {!expanded ? <p className="truncate text-xs text-slate-500">{preview}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
          {tiers.length} tier
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-slate-200 bg-white p-3">
          {tiers.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                      saving={savingId === tier.id}
                      onSave={onSave}
                      onDelete={() => onDelete(tier)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("catalog.harga.wholesaleEmptyStore")}</p>
          )}

          {canEdit ? (
            <AddTierForm
              storeId={store.id}
              saving={savingId === `new-${store.id}`}
              onAdd={onSave}
            />
          ) : null}
        </div>
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
