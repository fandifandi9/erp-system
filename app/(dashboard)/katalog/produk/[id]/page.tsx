"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileEdit, Loader2 } from "lucide-react";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { CatalogProductFormModal } from "@/components/catalog/CatalogProductFormModal";
import { ProductListStatusBadge } from "@/components/catalog/LifecycleBadge";
import { ProductImageGallery } from "@/components/catalog/ProductImageGallery";
import { ProductStockSummary } from "@/components/catalog/ProductStockSummary";
import { BundleEditor } from "@/components/catalog/BundleEditor";
import { ProductBusinessPanel } from "@/components/catalog/ProductBusinessPanel";
import { WmsCard } from "@/components/wms/ui";
import {
  fetchCatalogProduct,
} from "@/lib/catalog/client";
import { isProductLowStock } from "@/lib/catalog/product-last-sale";
import type { ProductStockOverview } from "@/lib/catalog/product-stock";
import {
  canActivateCatalogProduct,
  canEditCatalogPrices,
  resolveCatalogViewRole,
} from "@/lib/catalog/catalog-access";
import { getCatalogFieldVisibility, resolveRelationLabel } from "@/lib/catalog/product-fields";
import { normalizeLifecycleStatus } from "@/lib/catalog/product-lifecycle";
import type { CatalogProduct } from "@/lib/catalog/types";
import { fetchCategories, fetchBrands } from "@/lib/inventory/client";
import type { InvBrand, InvCategory } from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { resolveCatalogUpdatedAt } from "@/lib/catalog/catalog-meta";
import { formatIntegerId } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

function formatProductTimestamp(iso: string | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KatalogProdukDetailPage() {
  const { t, locale } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = pb.authStore.model;
  const fieldVis = getCatalogFieldVisibility(resolveCatalogViewRole(user));
  const canActivate = user ? canActivateCatalogProduct(user) : false;
  const canEditBundle = user ? canEditCatalogPrices(user) : false;
  const canEdit = fieldVis.editIdentity;
  const showStock = fieldVis.editLogistics;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [brands, setBrands] = useState<InvBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalStock, setGlobalStock] = useState<number | null>(null);
  const [stockByStore, setStockByStore] = useState<Record<string, number>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState<"identity" | "pricing">("identity");

  const reload = useCallback(async () => {
    if (!id) return;
    const res = await fetchCatalogProduct(id);
    setProduct(res.item);
  }, [id]);

  const ensureLookupData = useCallback(async () => {
    if (categories.length > 0 && brands.length > 0) return;
    try {
      const [cats, brs] = await Promise.all([fetchCategories(true), fetchBrands(true)]);
      setCategories(cats);
      setBrands(brs);
    } catch {
      /* abaikan */
    }
  }, [categories.length, brands.length]);

  const handleStockOverview = useCallback((overview: ProductStockOverview) => {
    setGlobalStock(overview.totalOnHand);
    const byStore: Record<string, number> = {};
    for (const row of overview.rows) {
      if (!row.storeId) continue;
      byStore[row.storeId] = (byStore[row.storeId] ?? 0) + row.onHand;
    }
    setStockByStore(byStore);
  }, []);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchCatalogProduct(id);
        if ((res.item.product_type ?? "simple") === "bundle") {
          router.replace(`/katalog/bundling/${id}`);
          return;
        }
        setProduct(res.item);
      } catch (e: unknown) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router]);

  useEffect(() => {
    if (editOpen) void ensureLookupData();
  }, [editOpen, ensureLookupData]);

  if (loading) {
    return (
      <InventoryShell title="" subtitle="" module="wms">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </InventoryShell>
    );
  }

  if (!product) {
    return (
      <InventoryShell title="" subtitle="" module="wms">
        <p className="text-sm text-red-600">{error || t("catalog.produk.notFound")}</p>
      </InventoryShell>
    );
  }

  const status = normalizeLifecycleStatus(product);
  const isBundle = (product.product_type ?? "simple") === "bundle";
  const lowStock =
    !isBundle && globalStock != null && isProductLowStock(globalStock, product.min_stock);

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={product.name}
        subtitle={t("catalog.produk.skuSubtitle", { sku: product.sku })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  void ensureLookupData();
                  setEditTab("identity");
                  setEditOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <FileEdit className="h-4 w-4" />
                {t("catalog.common.edit")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => router.push("/katalog/produk")}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("catalog.common.back")}
            </button>
          </div>
        }
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <WmsCard className="min-w-0">
            <div className="flex flex-col items-center text-center">
              <ProductImageGallery product={product} className="w-full" />
              <div className="mt-4 w-full">
                <ProductListStatusBadge status={status} lowStock={lowStock} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                {t("catalog.produk.lifecycleHint")}
              </p>
            </div>
          </WmsCard>

          <WmsCard className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("catalog.produk.identity")}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label={t("catalog.common.sku")} value={product.sku} mono />
              <Detail label={t("catalog.common.barcode")} value={product.barcode || "—"} mono />
              <Detail label={t("catalog.common.unit")} value={product.uom || "pcs"} />
              <Detail
                label={t("catalog.common.type")}
                value={product.product_type === "bundle" ? t("catalog.common.bundle") : t("catalog.common.simple")}
              />
              <Detail
                label={t("catalog.common.category")}
                value={resolveRelationLabel(product.category, product.expand?.category, categories)}
              />
              <Detail
                label={t("catalog.common.brand")}
                value={resolveRelationLabel(product.brand, product.expand?.brand, brands)}
              />
              {fieldVis.editLogistics ? (
                <>
                  <Detail
                    label={t("catalog.produk.minStock")}
                    value={String(product.min_stock ?? 0)}
                    warn={lowStock}
                  />
                  <Detail
                    label={t("catalog.produk.createdAt")}
                    value={formatProductTimestamp(product.created, locale)}
                  />
                  <Detail
                    label={t("catalog.produk.updatedAt")}
                    value={formatProductTimestamp(resolveCatalogUpdatedAt(product), locale)}
                    hint={t("catalog.produk.updatedAtHint")}
                  />
                  <Detail
                    label={t("catalog.produk.serialRequired")}
                    value={product.requires_serial ? t("catalog.common.yes") : t("catalog.common.no")}
                  />
                </>
              ) : null}
            </dl>
            {product.description ? (
              <div className="mt-6 border-t pt-4">
                <p className="text-xs font-semibold uppercase text-slate-500">{t("catalog.common.description")}</p>
                <p className="mt-2 text-sm text-slate-700">{product.description}</p>
              </div>
            ) : null}
          </WmsCard>
        </div>

        {showStock ? (
          <ProductStockSummary
            productId={product.id}
            isBundle={isBundle}
            onOverviewLoaded={handleStockOverview}
          />
        ) : null}

        {lowStock ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {t("catalog.produk.lowStockBadge")} —{" "}
            {t("catalog.produk.lowStockDetail", {
              stock: formatIntegerId(globalStock ?? 0),
              min: formatIntegerId(product.min_stock ?? 0),
            })}
          </div>
        ) : null}

        {fieldVis.showPrices ? (
          <ProductBusinessPanel
            product={product}
            canEditPrices={fieldVis.editPrices}
            showBuyPrice={fieldVis.showBuyPrice}
            globalStock={globalStock ?? undefined}
            stockByStore={stockByStore}
            onSaved={reload}
            onEditWholesale={
              canEditBundle
                ? () => {
                    setEditTab("pricing");
                    setEditOpen(true);
                  }
                : undefined
            }
          />
        ) : null}

        {isBundle ? (
          <BundleEditor bundleProductId={product.id} bundleName={product.name} canEdit={canEditBundle} />
        ) : null}
      </CatalogShell>

      <CatalogProductFormModal
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditTab("identity");
        }}
        product={product}
        onSaved={reload}
        fieldVis={fieldVis}
        canActivate={canActivate}
        categories={categories}
        brands={brands}
        initialTab={editTab}
      />
    </InventoryShell>
  );
}

function Detail({
  label,
  value,
  mono,
  warn,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2.5 " +
        (warn ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white")
      }
    >
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-sm font-medium ${warn ? "text-rose-700" : "text-slate-900"} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}
