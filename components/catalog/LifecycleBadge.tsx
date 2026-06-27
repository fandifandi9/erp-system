import type { ProductLifecycleStatus } from "@/lib/catalog/types";
import { PRODUCT_LIFECYCLE_UI } from "@/lib/catalog/product-lifecycle";
import { useLocale } from "@/components/LocaleProvider";

const toneClass: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
};

const LIFECYCLE_KEY: Record<ProductLifecycleStatus, string> = {
  draft: "catalog.lifecycle.draft",
  active: "catalog.lifecycle.active",
  inactive: "catalog.lifecycle.inactive",
};

export function LifecycleBadge({ status }: { status: ProductLifecycleStatus }) {
  const { t } = useLocale();
  const ui = PRODUCT_LIFECYCLE_UI[status];
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset " +
        toneClass[ui.tone]
      }
    >
      {t(LIFECYCLE_KEY[status])}
    </span>
  );
}

/** Status di tabel list — stok menipis menggantikan label Aktif. */
export function ProductListStatusBadge({
  status,
  lowStock,
}: {
  status: ProductLifecycleStatus;
  lowStock?: boolean;
}) {
  const { t } = useLocale();
  if (status === "active" && lowStock) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 ring-1 ring-inset ring-rose-200">
        {t("catalog.produk.lowStockBadge")}
      </span>
    );
  }
  return <LifecycleBadge status={status} />;
}
