"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Package } from "lucide-react";
import { WmsCard } from "@/components/wms/ui";
import { fetchBundleLines, fetchCatalogProducts, saveBundleLines } from "@/lib/catalog/client";
import { fetchSalesWarehouses } from "@/lib/inventory/client";
import { fetchStockMapByWarehouse } from "@/lib/inventory/stock-balances";
import { computeBundleAvailableFromStockMap } from "@/lib/catalog/bundle-expand";
import type { BundleLineInput, CatalogProductListItem } from "@/lib/catalog/types";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

type DraftLine = BundleLineInput & { key: string };

type Props = {
  bundleProductId: string;
  bundleName: string;
  canEdit: boolean;
};

export function BundleEditor({ bundleProductId, bundleName, canEdit }: Props) {
  const { t } = useLocale();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [components, setComponents] = useState<CatalogProductListItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<
    { id: string; code: string; name: string; storeName?: string }[]
  >([]);
  const [available, setAvailable] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bundleLines, prodRes, wh] = await Promise.all([
        fetchBundleLines(bundleProductId),
        fetchCatalogProducts({ lifecycle: "active", perPage: 200, productType: "simple" }),
        fetchSalesWarehouses(),
      ]);
      setLines(
        bundleLines.map((l, i) => ({
          key: l.id || `line-${i}`,
          component_product: l.component_product,
          qty: l.qty,
          sort_order: l.sort_order ?? i,
          is_active: l.is_active !== false,
        })),
      );
      setComponents(prodRes.items.filter((p) => p.id !== bundleProductId));
      setWarehouses(
        wh.map((w) => ({
          id: w.id,
          code: w.code,
          name: w.name,
          storeName: (w as { expand?: { store?: { name?: string } } }).expand?.store?.name,
        })),
      );
      if (wh.length === 1) setWarehouseId(wh[0].id);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [bundleProductId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!warehouseId || lines.length === 0) {
      setAvailable(null);
      return;
    }
    void fetchStockMapByWarehouse(warehouseId).then((stockMap) => {
      setAvailable(
        computeBundleAvailableFromStockMap(
          lines.map((l) => ({ component_product: l.component_product, qty: l.qty })),
          stockMap,
        ),
      );
    });
  }, [warehouseId, lines]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { key: `new-${Date.now()}`, component_product: "", qty: 1, is_active: true },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      const payload = lines
        .filter((l) => l.component_product && l.qty > 0)
        .map((l, i) => ({
          component_product: l.component_product,
          qty: l.qty,
          sort_order: i,
          is_active: l.is_active !== false,
        }));
      await saveBundleLines(bundleProductId, payload);
      setToast(t("catalog.bundling.savedToast"));
      setTimeout(() => setToast(""), 2500);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <WmsCard className="flex items-center justify-center py-12">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
      </WmsCard>
    );
  }

  return (
    <WmsCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{t("catalog.bundling.componentsTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("catalog.bundling.componentsSubtitle", { name: bundleName })}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("catalog.bundling.saveComponents")}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("catalog.bundling.previewStock")}
          </span>
          <select
            className="min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
          >
            <option value="">{t("catalog.bundling.selectWarehouse")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
                {w.storeName ? ` (${w.storeName})` : ""}
              </option>
            ))}
          </select>
        </label>
        {warehouses.length === 0 ? (
          <p className="pb-2 text-xs text-amber-700">{t("catalog.bundling.noSalesWarehouse")}</p>
        ) : null}
        {available != null ? (
          <p className="pb-2 text-sm font-semibold text-indigo-800">
            {t("catalog.bundling.available", { count: available })}
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("catalog.bundling.previewStockHint")}</p>

      <div className="mt-4 space-y-3">
        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            {t("catalog.bundling.emptyComponents")}
          </div>
        ) : (
          lines.map((line) => {
            const comp = components.find((c) => c.id === line.component_product);
            return (
              <div
                key={line.key}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <Package className="h-4 w-4 shrink-0 text-slate-400" />
                <select
                  disabled={!canEdit}
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={line.component_product}
                  onChange={(e) => updateLine(line.key, { component_product: e.target.value })}
                >
                  <option value="">{t("catalog.bundling.selectComponent")}</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.sku} — {c.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  {t("catalog.common.qty")}
                  <input
                    type="number"
                    min={0.0001}
                    step="any"
                    disabled={!canEdit}
                    value={line.qty}
                    onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) || 0 })}
                    className="w-24 rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  />
                </label>
                {comp ? (
                  <span className="text-xs text-slate-500">{comp.uom || "pcs"}{t("catalog.common.perBundle")}</span>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={addLine}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-dashed border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          <Plus className="h-4 w-4" />
          {t("catalog.bundling.addComponent")}
        </button>
      ) : null}
    </WmsCard>
  );
}
