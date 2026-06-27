"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Loader2, Plus, ChevronRight, X } from "lucide-react";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { LifecycleBadge } from "@/components/catalog/LifecycleBadge";
import { WmsCard } from "@/components/wms/ui";
import {
  canActivateCatalogProduct,
  resolveCatalogViewRole,
} from "@/lib/catalog/catalog-access";
import { createCatalogProduct, fetchCatalogProducts, fetchBundlesEstimatedGlobalQty } from "@/lib/catalog/client";
import { normalizeLifecycleStatus } from "@/lib/catalog/product-lifecycle";
import type { CatalogProductListItem } from "@/lib/catalog/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

export default function KatalogBundlingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const user = pb.authStore.model;
  const canManage = user ? canActivateCatalogProduct(user) : false;
  const showPrices = resolveCatalogViewRole(user) !== "warehouse";

  const [bundles, setBundles] = useState<CatalogProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [estStockByBundle, setEstStockByBundle] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCatalogProducts({
        lifecycle: "any",
        perPage: 200,
        productType: "bundle",
      });
      setBundles(res.items);
      setStockLoading(true);
      try {
        const est = await fetchBundlesEstimatedGlobalQty(res.items.map((b) => b.id));
        setEstStockByBundle(est);
      } catch {
        setEstStockByBundle({});
      } finally {
        setStockLoading(false);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createBundle = async () => {
    if (!canManage || !newSku.trim() || !newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const item = await createCatalogProduct({
        sku: newSku.trim(),
        name: newName.trim(),
        product_type: "bundle",
        lifecycle_status: "draft",
      });
      setCreateOpen(false);
      setNewSku("");
      setNewName("");
      router.push(`/katalog/bundling/${item.id}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const draftCount = bundles.filter((b) => normalizeLifecycleStatus(b) === "draft").length;

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={t("catalog.bundling.title")}
        subtitle={t("catalog.bundling.subtitle")}
        actions={
          canManage ? (
            <button
              type="button"
              disabled={creating}
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("catalog.bundling.newBundle")}
            </button>
          ) : null
        }
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {draftCount > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {t("catalog.bundling.draftHint", { count: formatIntegerId(draftCount) })}
          </div>
        ) : null}

        <WmsCard className="border-indigo-100 bg-indigo-50/30">
          <div className="flex gap-3">
            <Layers className="h-5 w-5 shrink-0 text-indigo-600" />
            <p className="text-sm text-slate-700">{t("catalog.bundling.info")}</p>
          </div>
        </WmsCard>

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
            </div>
          ) : bundles.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              {t("catalog.bundling.empty")}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bundles.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/katalog/bundling/${b.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{b.name}</p>
                      <p className="font-mono text-xs text-slate-500">{b.sku}</p>
                      <div className="mt-2">
                        <LifecycleBadge status={normalizeLifecycleStatus(b)} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      {showPrices && b.sell_price ? (
                        <span className="text-sm font-medium text-slate-700">
                          Rp {b.sell_price.toLocaleString("id-ID")}
                        </span>
                      ) : null}
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {t("catalog.bundling.colEstStock")}
                        </p>
                        <p className="text-sm font-medium tabular-nums text-slate-700">
                          {stockLoading ? "…" : formatIntegerId(estStockByBundle[b.id] ?? 0)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {createOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{t("catalog.bundling.newBundle")}</h3>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t("catalog.common.sku")}</span>
                  <input
                    autoFocus
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder={t("catalog.bundling.promptSku")}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{t("catalog.common.name")}</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void createBundle()}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder={t("catalog.bundling.promptName")}
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={creating || !newSku.trim() || !newName.trim()}
                  onClick={() => void createBundle()}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("catalog.bundling.createBundle")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </CatalogShell>
    </InventoryShell>
  );
}
