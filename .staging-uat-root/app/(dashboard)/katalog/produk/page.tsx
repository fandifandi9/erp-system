"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Loader2,
  Package,
  AlertCircle,
  CheckCircle2,
  FileEdit,
} from "lucide-react";
import { CatalogProductFormModal } from "@/components/catalog/CatalogProductFormModal";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { ProductListStatusBadge } from "@/components/catalog/LifecycleBadge";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchCatalogProducts,
} from "@/lib/catalog/client";
import {
  canActivateCatalogProduct,
  resolveCatalogViewRole,
} from "@/lib/catalog/catalog-access";
import { getCatalogFieldVisibility, resolveRelationLabel } from "@/lib/catalog/product-fields";
import { normalizeLifecycleStatus } from "@/lib/catalog/product-lifecycle";
import type { CatalogProductListItem, ProductLifecycleStatus } from "@/lib/catalog/types";
import { getProductImageUrl, fetchCategories, fetchBrands } from "@/lib/inventory/client";
import type { InvBrand, InvCategory } from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { fetchProductsStockTotals } from "@/lib/catalog/product-stock";
import {
  fetchProductsLastSale,
  isProductLowStock,
  type ProductLastSaleInfo,
} from "@/lib/catalog/product-last-sale";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

type LifecycleFilter = "all" | ProductLifecycleStatus;

const fmtCurrency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

export default function KatalogProdukPage() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const viewHint = searchParams.get("view");
  const user = pb.authStore.model;
  const viewRole = resolveCatalogViewRole(user);
  const fieldVis = getCatalogFieldVisibility(viewRole);
  const canActivate = user ? canActivateCatalogProduct(user) : false;

  const [items, setItems] = useState<CatalogProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleFilter>(
    searchParams.get("status") === "draft" ? "draft" : "all",
  );
  const [totalItems, setTotalItems] = useState(0);
  const [draftCount, setDraftCount] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProductListItem | null>(null);
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [brands, setBrands] = useState<InvBrand[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [sellableByProduct, setSellableByProduct] = useState<Record<string, number>>({});
  const [lastSaleByProduct, setLastSaleByProduct] = useState<Record<string, ProductLastSaleInfo>>({});
  const [stockLoading, setStockLoading] = useState(false);

  const subtitle =
    viewHint === "warehouse" || viewRole === "warehouse"
      ? t("catalog.produk.subtitleWarehouse")
      : t("catalog.produk.subtitleSales");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [res, draftRes] = await Promise.all([
        fetchCatalogProducts({
          q: q.trim() || undefined,
          lifecycle,
          perPage: 100,
          productType: "simple",
        }),
        fetchCatalogProducts({ lifecycle: "draft", perPage: 1, productType: "simple" }),
      ]);
      setItems(res.items);
      setTotalItems(res.totalItems);
      setDraftCount(draftRes.totalItems);

      if (fieldVis.editLogistics) {
        setStockLoading(true);
        try {
          const simpleIds = res.items.map((p) => p.id);
          const [stockTotals, lastSales] = await Promise.all([
            fetchProductsStockTotals(simpleIds),
            fetchProductsLastSale(simpleIds),
          ]);
          setStockByProduct(stockTotals.global);
          setSellableByProduct(stockTotals.sellable);
          setLastSaleByProduct(lastSales);
        } catch {
          setStockByProduct({});
          setSellableByProduct({});
          setLastSaleByProduct({});
        } finally {
          setStockLoading(false);
        }
      } else {
        setStockByProduct({});
        setSellableByProduct({});
        setLastSaleByProduct({});
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("catalog.produk.errLoad")));
    } finally {
      setLoading(false);
    }
  }, [q, lifecycle, fieldVis.editLogistics, t]);

  useEffect(() => {
    void (async () => {
      try {
        const [cats, brs] = await Promise.all([fetchCategories(true), fetchBrands(true)]);
        setCategories(cats);
        setBrands(brs);
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tableColSpan = useMemo(
    () => 6 + (fieldVis.showSellPrice ? 1 : 0) + (fieldVis.editLogistics ? 1 : 0),
    [fieldVis.editLogistics, fieldVis.showSellPrice],
  );

  const stats = useMemo(() => {
    let active = 0;
    let draft = 0;
    let inactive = 0;
    for (const p of items) {
      const s = normalizeLifecycleStatus(p);
      if (s === "active") active++;
      else if (s === "draft") draft++;
      else inactive++;
    }
    return { active, draft, inactive };
  }, [items]);

  const openNew = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEdit = (p: CatalogProductListItem) => {
    setEditingProduct(p);
    setModalOpen(true);
  };

  const lifecycleTabs: { key: LifecycleFilter; label: string }[] = [
    { key: "all", label: t("activity.filterAll") },
    { key: "active", label: t("catalog.produk.active") },
    { key: "draft", label: t("catalog.produk.draft") },
    { key: "inactive", label: t("catalog.produk.inactive") },
  ];

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={t("catalog.produk.title")}
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t("catalog.produk.addProduct")}
          </button>
        }
      >
        {draftCount > 0 && canActivate ? (
          <WmsCard className="border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-white">
            <div className="flex flex-wrap items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-950">
                {t("catalog.produk.draftBanner", { count: formatIntegerId(draftCount) })}
              </p>
              <button
                type="button"
                onClick={() => setLifecycle("draft")}
                className="ml-auto text-sm font-semibold text-amber-800 hover:underline"
              >
                {t("catalog.produk.viewDraft")}
              </button>
            </div>
          </WmsCard>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatPill icon={CheckCircle2} label={t("catalog.produk.statActive")} value={stats.active} tone="emerald" />
          <StatPill icon={FileEdit} label={t("catalog.produk.statDraft")} value={stats.draft} tone="amber" />
          <StatPill icon={Package} label={t("catalog.produk.statTotal")} value={totalItems} tone="indigo" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder={t("catalog.produk.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t("catalog.common.search")}
          </button>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {lifecycleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setLifecycle(tab.key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                  (lifecycle === tab.key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {lifecycle === "all" ? (
          <p className="text-xs text-slate-500">{t("catalog.produk.filterVisibleHint")}</p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("catalog.produk.colProduct")}</th>
                  <th className="px-4 py-3">{t("catalog.common.sku")}</th>
                  <th className="px-4 py-3">{t("catalog.common.barcode")}</th>
                  <th className="px-4 py-3">{t("catalog.common.category")}</th>
                  <th className="px-4 py-3">{t("catalog.common.brand")}</th>
                  <th className="px-4 py-3">{t("catalog.common.status")}</th>
                  {fieldVis.showSellPrice ? <th className="px-4 py-3 text-right">{t("catalog.produk.colSellPrice")}</th> : null}
                  {fieldVis.editLogistics ? (
                    <th className="px-4 py-3 text-right">{t("catalog.produk.colGlobalStock")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-16 text-center text-slate-500">
                      <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-500" />
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-16 text-center text-slate-400">
                      {t("catalog.produk.empty")}
                    </td>
                  </tr>
                ) : (
                  items.map((p) => {
                    const status = normalizeLifecycleStatus(p);
                    const img = getProductImageUrl(p as Parameters<typeof getProductImageUrl>[0], "40x40");
                    const globalStock = stockByProduct[p.id] ?? 0;
                    const sellableStock = sellableByProduct[p.id] ?? 0;
                    const lowStock = isProductLowStock(globalStock, p.min_stock);
                    const lastSale = lastSaleByProduct[p.id];
                    const staleSale = !!lastSale?.isStale;
                    return (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {img ? (
                              <img src={img} alt="" className="h-9 w-9 rounded-lg border object-cover" />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                                <Package className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                            <div>
                              <Link
                                href={`/katalog/produk/${p.id}`}
                                className="font-medium text-indigo-700 hover:underline"
                              >
                                {p.name}
                              </Link>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => openEdit(p)}
                                  className="text-[11px] font-medium text-indigo-600 hover:underline"
                                >
                                  {t("catalog.common.edit")}
                                </button>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {p.requires_serial ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                                    {t("catalog.produk.badgeSerial")}
                                  </span>
                                ) : null}
                                {staleSale ? (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                    {t("catalog.produk.staleSaleBadge")}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.barcode || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {resolveRelationLabel(p.category, p.expand?.category, categories)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {resolveRelationLabel(p.brand, p.expand?.brand, brands)}
                        </td>
                        <td className="px-4 py-3">
                          <ProductListStatusBadge status={status} lowStock={lowStock} />
                        </td>
                        {fieldVis.showSellPrice ? (
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {p.sell_price ? fmtCurrency.format(p.sell_price) : "—"}
                          </td>
                        ) : null}
                        {fieldVis.editLogistics ? (
                          <td className="px-4 py-3 text-right text-slate-600">
                            {stockLoading ? (
                              <span className="text-slate-400">…</span>
                            ) : (
                              <div>
                                <span
                                  className={
                                    "font-medium tabular-nums " +
                                    (lowStock ? "text-rose-700" : "text-slate-900")
                                  }
                                >
                                  {formatIntegerId(globalStock)}
                                </span>
                                {(p.min_stock ?? 0) > 0 ? (
                                  <span className="mt-0.5 block text-[10px] text-slate-400">
                                    min {formatIntegerId(p.min_stock ?? 0)}
                                  </span>
                                ) : null}
                                <span className="mt-0.5 block text-[10px] font-medium text-cyan-700">
                                  {t("catalog.produk.sellableNow", {
                                    count: formatIntegerId(sellableStock),
                                  })}
                                </span>
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      <CatalogProductFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editingProduct}
        onSaved={load}
        fieldVis={fieldVis}
        canActivate={canActivate}
        categories={categories}
        brands={brands}
        allowBundleType={false}
      />
      </CatalogShell>
    </InventoryShell>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "emerald" | "amber" | "indigo";
}) {
  const tones = {
    emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-800",
    amber: "from-amber-50 to-white border-amber-100 text-amber-900",
    indigo: "from-indigo-50 to-white border-indigo-100 text-indigo-900",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br px-4 py-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold">{formatIntegerId(value)}</p>
    </div>
  );
}
