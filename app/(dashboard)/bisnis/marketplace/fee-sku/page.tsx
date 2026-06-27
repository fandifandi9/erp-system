"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, X, Loader2, ArrowLeft, Search, Tag as TagIcon, Layers, AlertTriangle, Wand2,
} from "lucide-react";
import type {
  MpProductFee,
  MpSellerTier,
  MpSkuAffCalcType,
  MpSkuCalcType,
  MpTierDefault,
  ProductTag,
  SalesChannel,
} from "@/lib/bisnis/types";
import { MarketplaceAvatar } from "@/components/bisnis/MarketplaceAvatar";
import { relationId } from "@/lib/bisnis/relation-id";
import { fetchSalesChannels, fetchMpSellerTiers } from "@/lib/bisnis/client";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

type ProductLite = { id: string; sku: string; name: string };

type FeeFormState = {
  mp_calc_type: MpSkuCalcType;
  mp_rate: string;
  mp_max_amount: string;
  mp_fixed_amount: string;
  aff_calc_type: MpSkuAffCalcType;
  aff_rate: string;
  aff_max_amount: string;
  aff_fixed_amount: string;
};

const EMPTY_FEE = (allowInherit: boolean): FeeFormState => ({
  mp_calc_type: "percent",
  mp_rate: "",
  mp_max_amount: "",
  mp_fixed_amount: "",
  aff_calc_type: allowInherit ? "inherit" : "none",
  aff_rate: "",
  aff_max_amount: "",
  aff_fixed_amount: "",
});

const fmtRp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

function feeLabel(calcType?: string, rate?: number, max?: number, fixed?: number): string {
  switch (calcType) {
    case "percent":
      return `${rate ?? 0}%`;
    case "percent_cap":
      return `${rate ?? 0}% max ${fmtRp(max ?? 0)}`;
    case "fixed":
      return `${fmtRp(fixed ?? 0)}/item`;
    case "inherit":
      return "Ikut default tier";
    case "none":
      return "Tidak ada";
    default:
      return "—";
  }
}

function feeFormFromRow(row: {
  mp_calc_type: MpSkuCalcType;
  mp_rate?: number;
  mp_max_amount?: number;
  mp_fixed_amount?: number;
  aff_calc_type: string;
  aff_rate?: number;
  aff_max_amount?: number;
  aff_fixed_amount?: number;
}): FeeFormState {
  return {
    mp_calc_type: row.mp_calc_type,
    mp_rate: row.mp_rate ? String(row.mp_rate) : "",
    mp_max_amount: row.mp_max_amount ? String(row.mp_max_amount) : "",
    mp_fixed_amount: row.mp_fixed_amount ? String(row.mp_fixed_amount) : "",
    aff_calc_type: (row.aff_calc_type || "none") as MpSkuAffCalcType,
    aff_rate: row.aff_rate ? String(row.aff_rate) : "",
    aff_max_amount: row.aff_max_amount ? String(row.aff_max_amount) : "",
    aff_fixed_amount: row.aff_fixed_amount ? String(row.aff_fixed_amount) : "",
  };
}

function feePayload(f: FeeFormState) {
  return {
    mp_calc_type: f.mp_calc_type,
    mp_rate: Number(f.mp_rate) || 0,
    mp_max_amount: Number(f.mp_max_amount) || 0,
    mp_fixed_amount: Number(f.mp_fixed_amount) || 0,
    aff_calc_type: f.aff_calc_type,
    aff_rate: Number(f.aff_rate) || 0,
    aff_max_amount: Number(f.aff_max_amount) || 0,
    aff_fixed_amount: Number(f.aff_fixed_amount) || 0,
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Permintaan gagal.");
  }
  return data;
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

function FeeFields({
  value,
  onChange,
  allowInherit,
}: {
  value: FeeFormState;
  onChange: (v: FeeFormState) => void;
  allowInherit: boolean;
}) {
  const set = (patch: Partial<FeeFormState>) => onChange({ ...value, ...patch });
  const affOptions: { v: MpSkuAffCalcType; label: string }[] = [
    ...(allowInherit ? [{ v: "inherit" as const, label: "Ikut default tier" }] : []),
    { v: "none", label: "Tidak ada" },
    { v: "percent", label: "Persen (%)" },
    { v: "percent_cap", label: "Persen + maksimum" },
    { v: "fixed", label: "Nominal tetap / item" },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-800">Fee marketplace</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Tipe</label>
            <select
              value={value.mp_calc_type}
              onChange={(e) => set({ mp_calc_type: e.target.value as MpSkuCalcType })}
              className={inputCls}
            >
              <option value="percent">Persen (%)</option>
              <option value="percent_cap">Persen + maksimum</option>
              <option value="fixed">Nominal tetap / item</option>
            </select>
          </div>
          {value.mp_calc_type !== "fixed" && (
            <div>
              <label className={labelCls}>Persen (%)</label>
              <input
                type="number" min="0" step="0.01" required
                value={value.mp_rate}
                onChange={(e) => set({ mp_rate: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
          {value.mp_calc_type === "percent_cap" && (
            <div>
              <label className={labelCls}>Maksimum (Rp)</label>
              <input
                type="number" min="0" required
                value={value.mp_max_amount}
                onChange={(e) => set({ mp_max_amount: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
          {value.mp_calc_type === "fixed" && (
            <div>
              <label className={labelCls}>Nominal / item (Rp)</label>
              <input
                type="number" min="0" required
                value={value.mp_fixed_amount}
                onChange={(e) => set({ mp_fixed_amount: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-800">Fee affiliate</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Tipe</label>
            <select
              value={value.aff_calc_type}
              onChange={(e) => set({ aff_calc_type: e.target.value as MpSkuAffCalcType })}
              className={inputCls}
            >
              {affOptions.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
          </div>
          {(value.aff_calc_type === "percent" || value.aff_calc_type === "percent_cap") && (
            <div>
              <label className={labelCls}>Persen (%)</label>
              <input
                type="number" min="0" step="0.01" required
                value={value.aff_rate}
                onChange={(e) => set({ aff_rate: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
          {value.aff_calc_type === "percent_cap" && (
            <div>
              <label className={labelCls}>Maksimum (Rp)</label>
              <input
                type="number" min="0" required
                value={value.aff_max_amount}
                onChange={(e) => set({ aff_max_amount: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
          {value.aff_calc_type === "fixed" && (
            <div>
              <label className={labelCls}>Nominal / item (Rp)</label>
              <input
                type="number" min="0" required
                value={value.aff_fixed_amount}
                onChange={(e) => set({ aff_fixed_amount: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
        </div>
        {allowInherit && value.aff_calc_type === "inherit" && (
          <p className="mt-2 text-xs text-slate-500">
            Affiliate SKU ini mengikuti default tier. Pilih tipe lain hanya jika SKU ini beda.
          </p>
        )}
      </div>
    </div>
  );
}

export default function MpFeeSkuPage() {
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [tiers, setTiers] = useState<MpSellerTier[]>([]);
  const [tags, setTags] = useState<ProductTag[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selChannel, setSelChannel] = useState("");
  const [selTier, setSelTier] = useState("");

  const [tierDefault, setTierDefault] = useState<MpTierDefault | null>(null);
  const [feeRows, setFeeRows] = useState<MpProductFee[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const [defaultModal, setDefaultModal] = useState(false);
  const [defaultForm, setDefaultForm] = useState<FeeFormState>(EMPTY_FEE(false));

  const [feeModal, setFeeModal] = useState(false);
  const [editFee, setEditFee] = useState<MpProductFee | null>(null);
  const [feeForm, setFeeForm] = useState<FeeFormState>(EMPTY_FEE(true));
  const [productQuery, setProductQuery] = useState("");
  const [selProduct, setSelProduct] = useState<ProductLite | null>(null);

  const [bulkModal, setBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState<FeeFormState>(EMPTY_FEE(true));
  const [bulkTag, setBulkTag] = useState("");

  const [tagModal, setTagModal] = useState(false);
  const [activeTag, setActiveTag] = useState<ProductTag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagProductQuery, setTagProductQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const loadMaster = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [ch, tr, tg, pr] = await Promise.all([
        fetchSalesChannels(false),
        fetchMpSellerTiers(),
        api<{ items: ProductTag[] }>("/api/bisnis/mp-fees/tags").then((r) => r.items),
        pb.collection(INV_COLLECTIONS.products).getFullList<ProductLite>({
          filter: "is_active = true",
          sort: "name",
          fields: "id,sku,name",
          requestKey: null,
        }),
      ]);
      setChannels(ch);
      setTiers(tr);
      setTags(tg);
      setProducts(pr);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMaster();
  }, [loadMaster]);

  const tiersFor = useMemo(
    () =>
      tiers
        .filter((t) => relationId(t.channel) === selChannel && t.is_active)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tiers, selChannel],
  );

  const loadFees = useCallback(async () => {
    if (!selTier) {
      setTierDefault(null);
      setFeeRows([]);
      setTotalItems(0);
      setTotalPages(1);
      return;
    }
    setFeeLoading(true);
    try {
      const params = new URLSearchParams({ tier: selTier, page: String(page) });
      if (q) params.set("q", q);
      if (tagFilter) params.set("tag", tagFilter);
      const [defRes, feeRes] = await Promise.all([
        api<{ items: MpTierDefault[] }>(`/api/bisnis/mp-fees/tier-defaults?tier=${selTier}`),
        api<{ items: MpProductFee[]; totalItems: number; totalPages: number }>(
          `/api/bisnis/mp-fees/product-fees?${params}`,
        ),
      ]);
      setTierDefault(defRes.items[0] ?? null);
      setFeeRows(feeRes.items);
      setTotalItems(feeRes.totalItems);
      setTotalPages(Math.max(feeRes.totalPages, 1));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal memuat fee");
    } finally {
      setFeeLoading(false);
    }
  }, [selTier, page, q, tagFilter]);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  const refreshTags = async () => {
    const r = await api<{ items: ProductTag[] }>("/api/bisnis/mp-fees/tags");
    setTags(r.items);
    if (activeTag) setActiveTag(r.items.find((t) => t.id === activeTag.id) ?? null);
  };

  // ─── Default tier ───

  const openDefaultModal = () => {
    setDefaultForm(tierDefault ? feeFormFromRow(tierDefault) : EMPTY_FEE(false));
    setDefaultModal(true);
  };

  const saveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api("/api/bisnis/mp-fees/tier-defaults", {
        method: "POST",
        body: JSON.stringify({ seller_tier: selTier, ...feePayload(defaultForm) }),
      });
      setDefaultModal(false);
      await loadFees();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan default");
    } finally {
      setSubmitting(false);
    }
  };

  const removeDefault = async () => {
    if (!tierDefault) return;
    if (!confirm("Hapus default tier? SKU tanpa fee sendiri akan dihitung 0 (warning).")) return;
    try {
      await api(`/api/bisnis/mp-fees/tier-defaults/${tierDefault.id}`, { method: "DELETE" });
      await loadFees();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus default");
    }
  };

  // ─── Fee per SKU ───

  const openNewFee = () => {
    setEditFee(null);
    setSelProduct(null);
    setProductQuery("");
    setFeeForm(EMPTY_FEE(true));
    setFeeModal(true);
  };

  const openEditFee = (row: MpProductFee) => {
    setEditFee(row);
    const p = row.expand?.product ?? productById.get(row.product) ?? null;
    setSelProduct(p ? { id: p.id, sku: p.sku, name: p.name } : null);
    setFeeForm(feeFormFromRow(row));
    setFeeModal(true);
  };

  const saveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editFee) {
        await api(`/api/bisnis/mp-fees/product-fees/${editFee.id}`, {
          method: "PATCH",
          body: JSON.stringify(feePayload(feeForm)),
        });
      } else {
        if (!selProduct) throw new Error("Pilih produk dulu.");
        await api("/api/bisnis/mp-fees/product-fees", {
          method: "POST",
          body: JSON.stringify({ seller_tier: selTier, product: selProduct.id, ...feePayload(feeForm) }),
        });
      }
      setFeeModal(false);
      await loadFees();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan fee");
    } finally {
      setSubmitting(false);
    }
  };

  const removeFee = async (row: MpProductFee) => {
    const p = row.expand?.product;
    if (!confirm(`Hapus fee SKU ${p?.sku ?? ""}? SKU ini akan kembali ikut default tier.`)) return;
    try {
      await api(`/api/bisnis/mp-fees/product-fees/${row.id}`, { method: "DELETE" });
      await loadFees();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus fee");
    }
  };

  // ─── Bulk ───

  const saveBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkTag) {
      alert("Pilih tag dulu.");
      return;
    }
    const tag = tags.find((t) => t.id === bulkTag);
    const count = tag?.products?.length ?? 0;
    if (!confirm(`Terapkan fee ini ke ${count} SKU anggota tag "${tag?.name}"?`)) return;
    setSubmitting(true);
    try {
      const r = await api<{ updated: number; created: number; total: number }>(
        "/api/bisnis/mp-fees/product-fees/bulk",
        {
          method: "POST",
          body: JSON.stringify({ seller_tier: selTier, tag_id: bulkTag, ...feePayload(bulkForm) }),
        },
      );
      setBulkModal(false);
      alert(`Selesai: ${r.created} dibuat, ${r.updated} diperbarui (total ${r.total} SKU).`);
      await loadFees();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal bulk update");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Tag ───

  const createTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagName.trim()) return;
    setSubmitting(true);
    try {
      await api("/api/bisnis/mp-fees/tags", {
        method: "POST",
        body: JSON.stringify({ name: tagName.trim() }),
      });
      setTagName("");
      await refreshTags();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal membuat tag");
    } finally {
      setSubmitting(false);
    }
  };

  const removeTag = async (tag: ProductTag) => {
    if (!confirm(`Hapus tag "${tag.name}"? Fee SKU tidak ikut terhapus.`)) return;
    try {
      await api(`/api/bisnis/mp-fees/tags/${tag.id}`, { method: "DELETE" });
      if (tagFilter === tag.id) setTagFilter("");
      if (activeTag?.id === tag.id) setActiveTag(null);
      await refreshTags();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus tag");
    }
  };

  const tagAddProduct = async (productId: string) => {
    if (!activeTag) return;
    try {
      await api(`/api/bisnis/mp-fees/tags/${activeTag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ add_products: [productId] }),
      });
      setTagProductQuery("");
      await refreshTags();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menambah produk ke tag");
    }
  };

  const tagRemoveProduct = async (productId: string) => {
    if (!activeTag) return;
    try {
      await api(`/api/bisnis/mp-fees/tags/${activeTag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ remove_products: [productId] }),
      });
      await refreshTags();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menghapus produk dari tag");
    }
  };

  const productSearch = (query: string, exclude?: Set<string>) => {
    const s = query.trim().toLowerCase();
    if (!s) return [];
    return products
      .filter((p) => !exclude?.has(p.id) && (p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)))
      .slice(0, 12);
  };

  const selChannelObj = channels.find((c) => c.id === selChannel) ?? null;
  const selTierObj = tiers.find((t) => t.id === selTier) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/bisnis/marketplace"
              className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="h-4 w-4" /> Master Marketplace
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fee per SKU</h1>
            <p className="mt-1 text-sm text-slate-500">
              Fee marketplace & affiliate per <strong>channel + tier + SKU</strong>. SKU tanpa fee
              sendiri otomatis ikut default tier.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setActiveTag(null); setTagModal(true); }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <TagIcon className="h-4 w-4" /> Kelola tag
            </button>
            <button
              type="button"
              onClick={() => { setBulkForm(EMPTY_FEE(true)); setBulkTag(tagFilter); setBulkModal(true); }}
              disabled={!selTier}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" /> Bulk update
            </button>
            <button
              type="button"
              onClick={openNewFee}
              disabled={!selTier}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Tambah fee SKU
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            {/* Pilih channel + tier */}
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
              <div>
                <label className={labelCls}>Marketplace</label>
                <select
                  value={selChannel}
                  onChange={(e) => { setSelChannel(e.target.value); setSelTier(""); setPage(1); }}
                  className={inputCls}
                >
                  <option value="">— Pilih marketplace —</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tier seller</label>
                <select
                  value={selTier}
                  onChange={(e) => { setSelTier(e.target.value); setPage(1); }}
                  disabled={!selChannel}
                  className={inputCls}
                >
                  <option value="">— Pilih tier —</option>
                  {tiersFor.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                {selChannel && tiersFor.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    Marketplace ini belum punya tier. Tambahkan dulu di Master Marketplace.
                  </p>
                )}
              </div>
            </div>

            {!selTier ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <Layers className="mx-auto h-12 w-12 text-slate-200" />
                <h3 className="mt-4 text-lg font-semibold text-slate-700">Pilih marketplace & tier</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Fee dikunci per kombinasi channel + tier + SKU.
                </p>
              </div>
            ) : (
              <>
                {/* Default tier */}
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {selChannelObj && <MarketplaceAvatar channel={selChannelObj} size="md" />}
                      <div>
                        <p className="font-semibold text-slate-900">
                          Default tier — {selTierObj?.label}
                        </p>
                        {tierDefault ? (
                          <p className="text-sm text-slate-600">
                            MP: <strong>{feeLabel(tierDefault.mp_calc_type, tierDefault.mp_rate, tierDefault.mp_max_amount, tierDefault.mp_fixed_amount)}</strong>
                            {" · "}Affiliate: <strong>{feeLabel(tierDefault.aff_calc_type, tierDefault.aff_rate, tierDefault.aff_max_amount, tierDefault.aff_fixed_amount)}</strong>
                          </p>
                        ) : (
                          <p className="flex items-center gap-1 text-sm text-amber-600">
                            <AlertTriangle className="h-4 w-4" /> Belum ada default — SKU tanpa fee sendiri dihitung 0.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={openDefaultModal}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> {tierDefault ? "Edit default" : "Atur default"}
                      </button>
                      {tierDefault && (
                        <button
                          type="button"
                          onClick={() => void removeDefault()}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Filter fee SKU */}
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <form
                    onSubmit={(e) => { e.preventDefault(); setQ(qInput.trim()); setPage(1); }}
                    className="relative flex-1"
                  >
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={qInput}
                      onChange={(e) => setQInput(e.target.value)}
                      placeholder="Cari SKU / nama produk… (Enter)"
                      className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                    />
                  </form>
                  <select
                    value={tagFilter}
                    onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-56"
                  >
                    <option value="">Semua tag</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.products?.length ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tabel fee SKU */}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {feeLoading ? (
                    <div className="flex justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                  ) : feeRows.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-500">
                      Belum ada fee per SKU untuk tier ini.
                      {tierDefault
                        ? " Semua SKU memakai default tier."
                        : " Tanpa default tier, fee dihitung 0 + warning."}
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Produk</th>
                          <th className="px-4 py-3">Fee marketplace</th>
                          <th className="px-4 py-3">Affiliate</th>
                          <th className="px-4 py-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {feeRows.map((row) => {
                          const p = row.expand?.product;
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/60">
                              <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-800">
                                {p?.sku ?? row.product}
                              </td>
                              <td className="max-w-[260px] truncate px-4 py-2.5 text-slate-700">{p?.name ?? "—"}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-900">
                                {feeLabel(row.mp_calc_type, row.mp_rate, row.mp_max_amount, row.mp_fixed_amount)}
                              </td>
                              <td className="px-4 py-2.5 text-slate-700">
                                {feeLabel(row.aff_calc_type, row.aff_rate, row.aff_max_amount, row.aff_fixed_amount)}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditFee(row)}
                                    className="rounded p-1 text-slate-400 hover:text-indigo-600"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void removeFee(row)}
                                    className="rounded p-1 text-slate-400 hover:text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600">
                      <span>{totalItems} SKU</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                          className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
                        >
                          Sebelumnya
                        </button>
                        <span>Hal {page} / {totalPages}</span>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                          className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modal: default tier */}
      {defaultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Default tier — {selTierObj?.label}</h2>
              <button type="button" onClick={() => setDefaultModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveDefault(e)} className="space-y-4 px-6 py-5">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Dipakai sebagai <strong>fallback</strong> untuk semua SKU yang belum punya fee sendiri di tier ini.
              </p>
              <FeeFields value={defaultForm} onChange={setDefaultForm} allowInherit={false} />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan default"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: fee SKU */}
      {feeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editFee ? "Edit fee SKU" : "Tambah fee SKU"}</h2>
              <button type="button" onClick={() => setFeeModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveFee(e)} className="space-y-4 px-6 py-5">
              <div>
                <label className={labelCls}>Produk (SKU ERP) *</label>
                {editFee || selProduct ? (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-slate-800">{selProduct?.sku}</p>
                      <p className="truncate text-sm text-slate-600">{selProduct?.name}</p>
                    </div>
                    {!editFee && (
                      <button
                        type="button"
                        onClick={() => { setSelProduct(null); setProductQuery(""); }}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      autoFocus
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Ketik SKU / nama produk…"
                      className={inputCls}
                    />
                    {productQuery.trim() && (
                      <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {productSearch(productQuery).map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => setSelProduct(p)}
                              className="flex w-full flex-col px-3 py-2 text-left hover:bg-indigo-50"
                            >
                              <span className="font-mono text-xs font-semibold text-slate-800">{p.sku}</span>
                              <span className="truncate text-sm text-slate-600">{p.name}</span>
                            </button>
                          </li>
                        ))}
                        {productSearch(productQuery).length === 0 && (
                          <li className="px-3 py-2 text-sm text-slate-500">Tidak ditemukan.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <FeeFields value={feeForm} onChange={setFeeForm} allowInherit />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan fee SKU"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: bulk update */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Bulk update fee — {selTierObj?.label}</h2>
              <button type="button" onClick={() => setBulkModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void saveBulk(e)} className="space-y-4 px-6 py-5">
              <div>
                <label className={labelCls}>Tag (kelompok SKU) *</label>
                <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} className={inputCls} required>
                  <option value="">— Pilih tag —</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.products?.length ?? 0} SKU)
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Fee di bawah diterapkan ke <strong>semua SKU anggota tag</strong> pada tier ini.
                  Transaksi lama tidak berubah (snapshot).
                </p>
              </div>
              <FeeFields value={bulkForm} onChange={setBulkForm} allowInherit />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Memproses…" : "Terapkan ke semua SKU tag"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: kelola tag */}
      {tagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Kelola tag produk</h2>
                <p className="text-xs text-slate-500">Tag hanya alat bantu filter & bulk update — tidak ikut hitung fee.</p>
              </div>
              <button type="button" onClick={() => setTagModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden sm:grid-cols-2">
              {/* Daftar tag */}
              <div className="flex flex-col overflow-hidden border-b sm:border-b-0 sm:border-r">
                <form onSubmit={(e) => void createTag(e)} className="flex shrink-0 gap-2 px-4 py-3">
                  <input
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="Nama tag baru…"
                    className={inputCls}
                  />
                  <button
                    type="submit"
                    disabled={submitting || !tagName.trim()}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
                <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {tags.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-slate-500">Belum ada tag.</li>
                  )}
                  {tags.map((t) => (
                    <li
                      key={t.id}
                      className={`flex cursor-pointer items-center justify-between px-4 py-2.5 ${activeTag?.id === t.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      onClick={() => { setActiveTag(t); setTagProductQuery(""); }}
                    >
                      <div className="flex items-center gap-2">
                        <TagIcon className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-slate-800">{t.name}</span>
                        <span className="text-xs text-slate-500">{t.products?.length ?? 0} SKU</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void removeTag(t); }}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Anggota tag */}
              <div className="flex flex-col overflow-hidden">
                {!activeTag ? (
                  <div className="flex flex-1 items-center justify-center p-6 text-sm text-slate-500">
                    Pilih tag untuk mengatur anggotanya.
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 px-4 py-3">
                      <p className="mb-2 text-sm font-semibold text-slate-800">
                        Anggota — {activeTag.name}
                      </p>
                      <div className="relative">
                        <input
                          value={tagProductQuery}
                          onChange={(e) => setTagProductQuery(e.target.value)}
                          placeholder="Tambah produk: ketik SKU / nama…"
                          className={inputCls}
                        />
                        {tagProductQuery.trim() && (
                          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {productSearch(tagProductQuery, new Set(activeTag.products ?? [])).map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => void tagAddProduct(p.id)}
                                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-indigo-50"
                                >
                                  <span className="font-mono text-xs font-semibold text-slate-800">{p.sku}</span>
                                  <span className="truncate text-sm text-slate-600">{p.name}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-2 pb-2">
                      {(activeTag.products ?? []).length === 0 && (
                        <li className="px-2 py-4 text-center text-sm text-slate-500">Belum ada anggota.</li>
                      )}
                      {(activeTag.products ?? []).map((pid) => {
                        const p = productById.get(pid);
                        return (
                          <li key={pid} className="flex items-center justify-between px-2 py-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold text-slate-800">{p?.sku ?? pid}</p>
                              <p className="truncate text-sm text-slate-600">{p?.name ?? "Produk tidak aktif"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void tagRemoveProduct(pid)}
                              className="rounded p-1 text-slate-400 hover:text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
