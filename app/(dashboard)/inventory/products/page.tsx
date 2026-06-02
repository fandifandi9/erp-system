"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchProducts, saveProduct, getProductImageUrl,
  fetchProductPriceTiers, saveProductPriceTier, deleteProductPriceTier,
  fetchWarehouses,
} from "@/lib/inventory/client";
import { fetchLastPurchaseUnitCosts } from "@/lib/bisnis/purchase-cost";
import {
  fetchGlobalStockByProduct,
  fetchStockMapByWarehouse,
  getStockQtyFromMap,
} from "@/lib/inventory/stock-balances";
import type { InvWarehouse } from "@/lib/inventory/types";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvProduct, InvProductPriceTier } from "@/lib/inventory/types";
import { formatIntegerId } from "@/lib/format-number";
import {
  Loader2, Plus, Search, X, Upload, Package, AlertTriangle,
  PackageX, Warehouse, ImageIcon, Trash2, Tag,
} from "lucide-react";

const fmtCurrency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 });
const fmtNumber = new Intl.NumberFormat("id-ID");
const fmt = (v?: number) => v ? fmtCurrency.format(v) : "Rp0";
const fmtNum = (v?: number) => v != null ? fmtNumber.format(v) : "0";

function parseRawNumber(s: string): string {
  return s.replace(/[^0-9]/g, "");
}
function formatLiveNumber(s: string): string {
  const raw = parseRawNumber(s);
  if (!raw) return "";
  return fmtNumber.format(Number(raw));
}

function RpInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (raw: string) => void; placeholder?: string; className?: string;
}) {
  const display = value ? formatLiveNumber(value) : "";
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder || "0"}
        onChange={(e) => onChange(parseRawNumber(e.target.value))}
        className={`pl-9 ${className || "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"}`}
      />
    </div>
  );
}

function NumInput({ value, onChange, placeholder, min, className }: {
  value: string; onChange: (raw: string) => void; placeholder?: string; min?: number; className?: string;
}) {
  const display = value ? formatLiveNumber(value) : "";
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder || "0"}
      onChange={(e) => {
        const raw = parseRawNumber(e.target.value);
        if (min !== undefined && raw && Number(raw) < min) return;
        onChange(raw);
      }}
      className={className || "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"}
    />
  );
}

export default function InventoryProductsPage() {
  const router = useRouter();
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [items, setItems] = useState<InvProduct[]>([]);
  const [globalStock, setGlobalStock] = useState<Record<string, number>>({});
  const [warehouseStock, setWarehouseStock] = useState<Record<string, number>>({});
  const [purchaseCosts, setPurchaseCosts] = useState<
    Record<string, { unit_cost: number; po_no?: string; order_date?: string }>
  >({});
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [currentBuyPrice, setCurrentBuyPrice] = useState(0);
  const [form, setForm] = useState({
    sku: "", barcode: "", name: "", description: "",
    uom: "pcs", min_stock: "0",
    sell_price: "0",
    category: "", brand: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  const [priceTiers, setPriceTiers] = useState<InvProductPriceTier[]>([]);
  const [tierForm, setTierForm] = useState({ label: "", min_qty: "", price: "" });
  const [tierSaving, setTierSaving] = useState(false);

  const selectedWh = warehouses.find((w) => w.id === warehouseId);

  const load = useCallback(async (search = q) => {
    setLoading(true);
    try {
      const [res, stockMap, wh] = await Promise.all([
        fetchProducts({ q: search }),
        fetchGlobalStockByProduct(),
        fetchWarehouses(),
      ]);
      setItems(res.items as unknown as InvProduct[]);
      setGlobalStock(stockMap);
      setWarehouses(wh);
      setTotalItems(res.totalItems);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!warehouseId) {
      setWarehouseStock({});
      setPurchaseCosts({});
      return;
    }
    void Promise.all([
      fetchStockMapByWarehouse(warehouseId),
      fetchLastPurchaseUnitCosts(warehouseId),
    ]).then(([stock, costs]) => {
      setWarehouseStock(stock);
      setPurchaseCosts(costs);
    });
  }, [warehouseId]);

  const loadMasterData = async () => {
    try {
      const [cats, brs] = await Promise.all([
        pb.collection("inv_categories").getFullList<{ id: string; name: string }>({ sort: "name", requestKey: null }).catch(() => []),
        pb.collection("inv_brands").getFullList<{ id: string; name: string }>({ sort: "name", requestKey: null }).catch(() => []),
      ]);
      setCategories(cats);
      setBrands(brs);
    } catch { /* ignore */ }
  };

  const stockStats = (() => {
    let lowStock = 0;
    let outOfStock = 0;
    items.forEach((p) => {
      const onHand = warehouseId
        ? getStockQtyFromMap(warehouseStock, p.id)
        : getStockQtyFromMap(globalStock, p.id);
      const min = p.min_stock ?? 0;
      if (onHand <= 0) outOfStock++;
      else if (min > 0 && onHand < min) lowStock++;
    });
    return { available: items.length, lowStock, outOfStock };
  })();

  const openNew = () => {
    setEditId(null);
    setCurrentBuyPrice(0);
    setForm({ sku: "", barcode: "", name: "", description: "", uom: "pcs", min_stock: "0", sell_price: "0", category: "", brand: "" });
    setImageFile(null);
    setImagePreview(null);
    setPriceTiers([]);
    setTierForm({ label: "", min_qty: "", price: "" });
    setError("");
    setModal(true);
    loadMasterData();
  };

  const openEdit = (p: InvProduct) => {
    setEditId(p.id);
    setCurrentBuyPrice(p.buy_price ?? 0);
    setForm({
      sku: p.sku,
      barcode: p.barcode || "",
      name: p.name,
      description: p.description || "",
      uom: p.uom || "pcs",
      min_stock: String(p.min_stock ?? 0),
      sell_price: String(p.sell_price ?? 0),
      category: p.category || "",
      brand: p.brand || "",
    });
    setImageFile(null);
    const existingImg = getProductImageUrl(p);
    setImagePreview(existingImg);
    setPriceTiers([]);
    setTierForm({ label: "", min_qty: "", price: "" });
    setError("");
    setModal(true);
    loadMasterData();
    fetchProductPriceTiers(p.id).then(setPriceTiers).catch(() => setPriceTiers([]));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar");
      return;
    }

    try {
      const webpFile = await convertToWebP(file);
      setImageFile(webpFile);
      setImagePreview(URL.createObjectURL(webpFile));
    } catch {
      setError("Gagal mengkonversi gambar");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      await saveProduct(
        {
          id: editId || undefined,
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || undefined,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          uom: form.uom.trim() || "pcs",
          min_stock: Number(form.min_stock) || 0,
          sell_price: Number(form.sell_price) || 0,
          category: form.category || undefined,
          brand: form.brand || undefined,
          is_active: true,
        },
        imageFile,
      );
      setModal(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Produk" subtitle="Kelola data produk, harga beli, harga jual, dan stok.">
        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Stok tersedia" sublabel="Total produk" value={String(totalItems)} color="blue" icon={Package} />
          <SummaryCard label="Stok segera habis" sublabel="Batas minimum" value={String(stockStats.lowStock)} color="amber" icon={AlertTriangle} />
          <SummaryCard label="Stok habis" sublabel="Total produk" value={String(stockStats.outOfStock)} color="red" icon={PackageX} />
          <SummaryCard
            label="Gudang"
            sublabel={selectedWh ? selectedWh.name : "Pilih filter"}
            value={selectedWh?.code ?? "—"}
            color="slate"
            icon={Warehouse}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter gudang
            </span>
            <select
              className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Semua gudang (stok global)</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          {warehouseId ? (
            <p className="text-xs text-slate-500 pb-2">
              Harga modal = pembelian terakhir ke gudang ini
            </p>
          ) : null}
        </div>

        {/* Search + Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Cari SKU / nama / barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
          </div>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cari
          </button>
          {canEdit && (
            <button type="button" onClick={openNew} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> Produk baru
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama produk</th>
                <th className="px-4 py-3 font-semibold">Kode produk</th>
                <th className="px-4 py-3 font-semibold">Barcode</th>
                <th className="hidden px-4 py-3 font-semibold md:table-cell">Kategori</th>
                <th className="px-4 py-3 font-semibold">Unit</th>
                <th className="px-4 py-3 font-semibold text-right">Min</th>
                <th className="px-4 py-3 font-semibold text-right">
                  {warehouseId && selectedWh ? `Stok (${selectedWh.code})` : "Stok global"}
                </th>
                <th className="px-4 py-3 font-semibold text-right" title="Unit cost pembelian terakhir">
                  Harga modal
                </th>
                <th className="px-4 py-3 font-semibold text-right">Harga jual</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">Belum ada produk.</td></tr>
              ) : (
                items.map((p) => {
                  const imgUrl = getProductImageUrl(p, "40x40");
                  const onHand = warehouseId
                    ? getStockQtyFromMap(warehouseStock, p.id)
                    : getStockQtyFromMap(globalStock, p.id);
                  const modalCost = warehouseId
                    ? purchaseCosts[p.id]?.unit_cost
                    : purchaseCosts[p.id]?.unit_cost ?? p.buy_price;
                  return (
                    <tr key={p.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {imgUrl ? (
                            <img src={imgUrl} alt="" className="h-8 w-8 rounded-md border border-slate-200 object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100">
                              <Package className="h-4 w-4 text-slate-400" />
                            </div>
                          )}
                          <button type="button" onClick={() => router.push(`/inventory/products/${p.id}`)}
                            className="text-left font-medium text-indigo-700 hover:text-indigo-900 hover:underline">{p.name}</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.sku}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.barcode || "—"}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{p.expand?.category?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{p.uom || "pcs"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{fmtNum(p.min_stock)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {fmtNum(onHand)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-800">
                        {modalCost != null && modalCost > 0 ? fmt(modalCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">{fmt(p.sell_price)}</td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => openEdit(p)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline">
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Modal Produk ─── */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8">
            <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-bold text-slate-900">{editId ? "Edit Produk" : "Produk Baru"}</h3>
                <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
                {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

                <div className="space-y-5">
                  {/* Image Upload */}
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Foto Produk</label>
                    <div className="flex items-start gap-4">
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                            <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                              className="absolute right-1 top-1 rounded-full bg-white/80 p-0.5 text-slate-500 hover:bg-white hover:text-red-500">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-1">
                            <ImageIcon className="h-6 w-6 text-slate-300" />
                            <span className="text-xs text-slate-400">No image</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <button type="button" onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          <Upload className="h-4 w-4" />
                          Upload Gambar
                        </button>
                        <p className="mt-1.5 text-xs text-slate-400">JPG, PNG, atau WebP. Otomatis dikonversi ke WebP.</p>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                      </div>
                    </div>
                  </div>

                  {/* Info Produk */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-700">Info Produk</h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">SKU / Kode Produk <span className="text-red-500">*</span></label>
                        <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Barcode</label>
                        <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">Nama Produk <span className="text-red-500">*</span></label>
                        <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-600">Deskripsi</label>
                        <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Kategori</label>
                        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                          <option value="">Tanpa kategori</option>
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Brand</label>
                        <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100">
                          <option value="">Tanpa brand</option>
                          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Satuan (Unit)</label>
                        <input type="text" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Batas stok minimum</label>
                        <NumInput value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} min={0} />
                      </div>
                    </div>
                  </div>

                  {/* Info Pembelian & Penjualan */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-slate-700">Info Pembelian</h4>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Harga beli terakhir (Rp)</label>
                        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                          {fmt(currentBuyPrice)}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Otomatis terupdate dari transaksi pembelian</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-slate-700">Info Penjualan</h4>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Harga jual satuan (Rp)</label>
                        <RpInput value={form.sell_price} onChange={(v) => setForm({ ...form, sell_price: v })} />
                      </div>
                    </div>
                  </div>

                  {/* Harga Grosir */}
                  {editId && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <Tag className="h-4 w-4 text-indigo-500" /> Harga Grosir / Perbanyak
                      </h4>
                      {priceTiers.length > 0 && (
                        <div className="mb-3 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-xs text-slate-500">
                              <tr>
                                <th className="px-3 py-2 text-left">Label</th>
                                <th className="px-3 py-2 text-right">Min Qty</th>
                                <th className="px-3 py-2 text-right">Harga</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {priceTiers.map((t) => (
                                <tr key={t.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2 font-medium text-slate-700">{t.label}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{t.min_qty}</td>
                                  <td className="px-3 py-2 text-right font-medium text-slate-900">{fmt(t.price)}</td>
                                  <td className="px-3 py-2 text-right">
                                    <button type="button" onClick={async () => {
                                      await deleteProductPriceTier(t.id);
                                      setPriceTiers(await fetchProductPriceTiers(editId));
                                    }} className="text-red-500 hover:text-red-700">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[100px]">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Label</label>
                          <input type="text" placeholder="Grosir / Reseller" value={tierForm.label}
                            onChange={(e) => setTierForm({ ...tierForm, label: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Min Qty</label>
                          <NumInput value={tierForm.min_qty} onChange={(v) => setTierForm({ ...tierForm, min_qty: v })} placeholder="12" min={1}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                        </div>
                        <div className="w-36">
                          <label className="mb-1 block text-xs font-medium text-slate-600">Harga</label>
                          <RpInput value={tierForm.price} onChange={(v) => setTierForm({ ...tierForm, price: v })} placeholder="0"
                            className="w-full rounded-lg border border-slate-300 pl-9 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                        </div>
                        <button type="button" disabled={tierSaving || !tierForm.label.trim() || !tierForm.min_qty || !tierForm.price || !editId}
                          onClick={async () => {
                            if (!editId) return;
                            setTierSaving(true);
                            setError("");
                            try {
                              await saveProductPriceTier({
                                product: editId,
                                label: tierForm.label.trim(),
                                min_qty: Number(tierForm.min_qty),
                                price: Number(tierForm.price),
                              });
                              setTierForm({ label: "", min_qty: "", price: "" });
                              setPriceTiers(await fetchProductPriceTiers(editId));
                            } catch (err) { setError(getErrorMessage(err)); }
                            finally { setTierSaving(false); }
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                          {tierSaving ? "..." : "+ Tambah"}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">Contoh: Grosir min 12 pcs = Rp200.000, Reseller min 50 pcs = Rp180.000</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Batal
                </button>
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        )}
      </InventoryShell>
    </InventoryGate>
  );
}

async function convertToWebP(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const maxDim = 1200;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
        else { w = Math.round(w * (maxDim / h)); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Conversion failed")); return; }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
        },
        "image/webp",
        0.85,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

function SummaryCard({ label, sublabel, value, color, icon: Icon }: {
  label: string; sublabel: string; value: string; color: "blue" | "amber" | "red" | "slate";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const styles = {
    blue: "border-l-blue-400 bg-blue-50",
    amber: "border-l-amber-400 bg-amber-50",
    red: "border-l-red-400 bg-red-50",
    slate: "border-l-slate-400 bg-slate-50",
  };
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 p-4 ${styles[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">{label}</div>
          <div className="mt-0.5 text-xs text-slate-500">{sublabel}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  );
}
