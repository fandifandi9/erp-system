"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import {
  activateCatalogProduct,
  archiveCatalogProduct,
  createCatalogProduct,
  updateCatalogProduct,
} from "@/lib/catalog/client";
import { normalizeLifecycleStatus } from "@/lib/catalog/product-lifecycle";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogFieldVisibility } from "@/lib/catalog/product-fields";
import type { CatalogProduct, CatalogProductListItem } from "@/lib/catalog/types";
import { ProductPricingPanel } from "@/components/catalog/ProductPricingPanel";
import {
  convertImageToWebp,
  getProductImageUrl,
  MAX_PRODUCT_IMAGES,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_FIELDS,
  type ProductImageField,
} from "@/lib/catalog/product-images";
import type { InvBrand, InvCategory } from "@/lib/inventory/types";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

export type CatalogProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  uom: string;
  min_stock: string;
  sell_price: string;
  requires_serial: boolean;
  product_type: "simple" | "bundle";
  category: string;
  brand: string;
};

type ImageSlotState = {
  preview: string | null;
  file: File | null;
  removeExisting: boolean;
};

const emptyForm = (): CatalogProductFormValues => ({
  sku: "",
  barcode: "",
  name: "",
  description: "",
  uom: "pcs",
  min_stock: "0",
  sell_price: "0",
  requires_serial: false,
  product_type: "simple",
  category: "",
  brand: "",
});

const emptyImageSlots = (): ImageSlotState[] =>
  Array.from({ length: MAX_PRODUCT_IMAGES }, () => ({
    preview: null,
    file: null,
    removeExisting: false,
  }));

type EditTab = "identity" | "pricing";

type Props = {
  open: boolean;
  onClose: () => void;
  product?: CatalogProduct | CatalogProductListItem | null;
  onSaved: () => void | Promise<void>;
  fieldVis: CatalogFieldVisibility;
  canActivate: boolean;
  categories: InvCategory[];
  brands: InvBrand[];
  initialTab?: EditTab;
  /** false di tab Produk — bundle hanya dibuat dari tab Bundling */
  allowBundleType?: boolean;
};

export function CatalogProductFormModal({
  open,
  onClose,
  product,
  onSaved,
  fieldVis,
  canActivate,
  categories,
  brands,
  initialTab = "identity",
  allowBundleType = true,
}: Props) {
  const { t } = useLocale();
  const editId = product?.id ?? null;
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [tab, setTab] = useState<EditTab>("identity");
  const [form, setForm] = useState<CatalogProductFormValues>(emptyForm);
  const [imageSlots, setImageSlots] = useState<ImageSlotState[]>(emptyImageSlots);
  const [saving, setSaving] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [error, setError] = useState("");

  const lifecycleStatus = product ? normalizeLifecycleStatus(product) : null;
  const showPricingTab = !!editId && fieldVis.showSellPrice;

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setError("");
    if (product) {
      setForm({
        sku: product.sku,
        barcode: product.barcode || "",
        name: product.name,
        description: "description" in product ? product.description || "" : "",
        uom: product.uom || "pcs",
        min_stock: String(product.min_stock ?? 0),
        sell_price: String(product.sell_price ?? 0),
        requires_serial: !!product.requires_serial,
        product_type: (product.product_type ?? "simple") as "simple" | "bundle",
        category: product.category || product.expand?.category?.id || "",
        brand: product.brand || product.expand?.brand?.id || "",
      });
      setImageSlots(
        PRODUCT_IMAGE_FIELDS.map((field) => ({
          preview: getProductImageUrl(product, field, "200x200"),
          file: null,
          removeExisting: false,
        })),
      );
    } else {
      setForm(emptyForm());
      setImageSlots(emptyImageSlots());
    }
  }, [open, product, initialTab]);

  if (!open) return null;

  const setSlot = (index: number, patch: Partial<ImageSlotState>) => {
    setImageSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const handlePickImage = async (index: number, file: File | null) => {
    if (!file) return;
    try {
      const webp = await convertImageToWebp(file);
      setSlot(index, {
        file: webp,
        preview: URL.createObjectURL(webp),
        removeExisting: false,
      });
    } catch {
      setError(t("catalog.produk.errImage"));
    }
  };

  const handleRemoveSlot = (index: number) => {
    const field = PRODUCT_IMAGE_FIELDS[index];
    const hadExisting = product ? !!product[field] : false;
    setSlot(index, {
      preview: null,
      file: null,
      removeExisting: hadExisting,
    });
    const input = fileRefs.current[index];
    if (input) input.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        uom: form.uom.trim() || "pcs",
        min_stock: Number(form.min_stock) || 0,
        sell_price: fieldVis.editPrices ? Number(form.sell_price) || 0 : undefined,
        requires_serial: form.requires_serial,
        product_type: canActivate ? form.product_type : "simple",
        category: form.category,
        brand: form.brand,
      };

      const images: Partial<Record<ProductImageField, File | null>> = {};
      const removals: Partial<Record<ProductImageField, boolean>> = {};
      PRODUCT_IMAGE_FIELDS.forEach((field, index) => {
        const slot = imageSlots[index];
        if (slot.file) images[field] = slot.file;
        else if (slot.removeExisting) removals[field] = true;
      });

      if (editId) {
        await updateCatalogProduct(editId, payload, images, removals);
      } else {
        await createCatalogProduct(payload, images);
      }
      onClose();
      await onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const runLifecycleAction = async (action: "activate" | "archive") => {
    if (!editId) return;
    if (action === "archive" && !window.confirm(t("catalog.produk.archiveConfirm"))) return;
    setLifecycleBusy(true);
    setError("");
    try {
      if (action === "activate") await activateCatalogProduct(editId);
      else await archiveCatalogProduct(editId);
      onClose();
      await onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLifecycleBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <form
        onSubmit={(e) => void submit(e)}
        onKeyDown={(e) => {
          // Scanner barcode kirim Enter di akhir — jangan submit form, cukup isi field.
          if (e.key !== "Enter") return;
          const el = e.target;
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            e.preventDefault();
          }
        }}
        className={
          "w-full rounded-2xl bg-white shadow-2xl " +
          (tab === "pricing" ? "max-w-4xl" : "max-w-lg")
        }
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">
            {editId ? t("catalog.produk.modalEdit") : t("catalog.produk.modalNew")}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {showPricingTab ? (
          <div className="flex gap-1 border-b px-6 pt-3">
            <TabButton active={tab === "identity"} onClick={() => setTab("identity")} label={t("catalog.produk.editTabIdentity")} />
            <TabButton active={tab === "pricing"} onClick={() => setTab("pricing")} label={t("catalog.produk.editTabPricing")} />
          </div>
        ) : null}

        {tab === "identity" ? (
        <div className="space-y-4 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : null}

          {!canActivate && !editId ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("catalog.produk.draftHint")}</p>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              {t("catalog.produk.photosHint", { max: String(MAX_PRODUCT_IMAGES) })}
            </p>
            <div className="flex flex-wrap gap-3">
              {imageSlots.map((slot, index) => (
                <div key={PRODUCT_IMAGE_FIELDS[index]} className="flex flex-col items-center gap-1">
                  <div className="relative h-20 w-20 overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50">
                    {slot.preview ? (
                      <img src={slot.preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-slate-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => fileRefs.current[index]?.click()}
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="h-3 w-3" />
                      {t("catalog.common.photo")}
                    </button>
                    {slot.preview ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(index)}
                        className="rounded-lg border px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        {t("catalog.common.remove")}
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={(el) => {
                      fileRefs.current[index] = el;
                    }}
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void handlePickImage(index, f);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <Field
            label={`${t("catalog.common.sku")} *`}
            value={form.sku}
            onChange={(v) => setForm({ ...form, sku: v })}
            mono
          />
          <Field label={`${t("catalog.common.name")} *`} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field
            label={t("catalog.common.barcode")}
            value={form.barcode}
            onChange={(v) => setForm({ ...form, barcode: v })}
            mono
          />

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{t("catalog.common.category")}</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">{t("catalog.produk.selectCategory")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{t("catalog.common.brand")}</span>
            <select
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">{t("catalog.produk.selectBrand")}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          {fieldVis.editPrices ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">{t("catalog.produk.sellPrice")}</span>
              <input
                value={form.sell_price ? formatIntegerId(parseIntegerInput(form.sell_price)) : ""}
                onChange={(e) =>
                  setForm({ ...form, sell_price: String(parseIntegerInput(e.target.value)) })
                }
                inputMode="numeric"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          ) : null}

          {canActivate && allowBundleType ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">{t("catalog.produk.productType")}</span>
              <select
                value={form.product_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    product_type: e.target.value as "simple" | "bundle",
                  })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="simple">{t("catalog.common.simpleType")}</option>
                <option value="bundle">{t("catalog.common.bundleType")}</option>
              </select>
            </label>
          ) : null}

          {fieldVis.editLogistics ? (
            <>
              <Field
                label={t("catalog.produk.minStock")}
                value={form.min_stock}
                onChange={(v) => setForm({ ...form, min_stock: v.replace(/\D/g, "") })}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.requires_serial}
                  onChange={(e) => setForm({ ...form, requires_serial: e.target.checked })}
                  className="rounded border-slate-300"
                />
                {t("catalog.produk.requiresSerial")}
              </label>
            </>
          ) : null}
        </div>
        ) : null}

        {tab === "pricing" && editId ? (
          <div className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-5">
            <ProductPricingPanel
              productId={editId}
              globalSellPrice={Number(form.sell_price) || product?.sell_price}
              canEdit={fieldVis.editPrices}
              uom={form.uom || product?.uom || "pcs"}
              showBuyPrice={fieldVis.showBuyPrice}
              embedded
            />
          </div>
        ) : null}

        {tab === "identity" && editId && canActivate && lifecycleStatus ? (
          <div className="border-t px-6 py-3">
            {lifecycleStatus === "active" ? (
              <button
                type="button"
                disabled={lifecycleBusy || saving}
                onClick={() => void runLifecycleAction("archive")}
                className="text-xs text-slate-500 underline-offset-2 hover:text-amber-900 hover:underline disabled:opacity-50"
              >
                {lifecycleBusy ? "…" : t("catalog.produk.archiveToDraft")}
              </button>
            ) : lifecycleStatus === "draft" ? (
              <button
                type="button"
                disabled={lifecycleBusy || saving}
                onClick={() => void runLifecycleAction("activate")}
                className="text-xs text-slate-500 underline-offset-2 hover:text-emerald-800 hover:underline disabled:opacity-50"
              >
                {lifecycleBusy ? "…" : t("catalog.produk.activateForSale")}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          {tab === "identity" ? (
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("catalog.common.save")}
          </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "mb-[-1px] rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition " +
        (active
          ? "border-indigo-600 text-indigo-700"
          : "border-transparent text-slate-500 hover:text-slate-800")
      }
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Font monospace — field scan barcode/SKU */
  mono?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={label.includes("*")}
        className={
          "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 " +
          (mono ? "font-mono" : "")
        }
      />
    </label>
  );
}
