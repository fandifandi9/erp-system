"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { BundleEditor } from "@/components/catalog/BundleEditor";
import { ProductBusinessPanel } from "@/components/catalog/ProductBusinessPanel";
import { LifecycleBadge } from "@/components/catalog/LifecycleBadge";
import {
  activateCatalogProduct,
  fetchCatalogProduct,
} from "@/lib/catalog/client";
import {
  canActivateCatalogProduct,
  canEditCatalogPrices,
} from "@/lib/catalog/catalog-access";
import { normalizeLifecycleStatus } from "@/lib/catalog/product-lifecycle";
import type { CatalogProduct } from "@/lib/catalog/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { useLocale } from "@/components/LocaleProvider";

export default function KatalogBundlingDetailPage() {
  const { t } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = pb.authStore.model;
  const canEdit = user ? canEditCatalogPrices(user) : false;
  const canActivate = user ? canActivateCatalogProduct(user) : false;

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetchCatalogProduct(id);
        if ((res.item.product_type ?? "simple") !== "bundle") {
          router.replace(`/katalog/produk/${id}`);
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

  const handleActivate = async () => {
    if (!id) return;
    setActivating(true);
    setError("");
    try {
      const item = await activateCatalogProduct(id);
      setProduct(item);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setActivating(false);
    }
  };

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
        <p className="text-sm text-red-600">{error || t("catalog.bundling.notFound")}</p>
      </InventoryShell>
    );
  }

  const status = normalizeLifecycleStatus(product);

  return (
    <InventoryShell title="" subtitle="" module="wms">
      <CatalogShell
        title={product.name}
        subtitle={`Bundle · SKU ${product.sku}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/katalog/bundling"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("catalog.bundling.list")}
            </Link>
            {status === "draft" && canActivate ? (
              <button
                type="button"
                disabled={activating}
                onClick={() => void handleActivate()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {activating ? t("catalog.produk.activating") : t("catalog.bundling.activateBundle")}
              </button>
            ) : null}
          </div>
        }
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <LifecycleBadge status={status} />
        </div>

        <ProductBusinessPanel
          product={product}
          canEditPrices={canEdit}
          showBuyPrice={false}
          onSaved={async () => {
            const res = await fetchCatalogProduct(id!);
            setProduct(res.item);
          }}
        />

        <BundleEditor bundleProductId={product.id} bundleName={product.name} canEdit={canEdit} />
      </CatalogShell>
    </InventoryShell>
  );
}
