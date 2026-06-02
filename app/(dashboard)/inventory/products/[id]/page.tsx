"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { getProductImageUrl, fetchBalances, fetchProductPriceTiers } from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS, type InvProduct, type InvStockBalance, type InvProductPriceTier } from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import {
  Loader2, ArrowLeft, Package, Edit2, Barcode, Tag,
  Layers, TrendingUp, TrendingDown, Calendar, PackageOpen,
} from "lucide-react";

const fmtCurrency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 });
const fmtNumber = new Intl.NumberFormat("id-ID");
const fmt = (v?: number) => v != null ? fmtCurrency.format(v) : "Rp0";
const fmtNum = (v?: number) => v != null ? fmtNumber.format(v) : "0";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);

  const [product, setProduct] = useState<InvProduct | null>(null);
  const [balances, setBalances] = useState<InvStockBalance[]>([]);
  const [priceTiers, setPriceTiers] = useState<InvProductPriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await pb.collection(INV_COLLECTIONS.products).getOne<InvProduct>(productId, {
        expand: "category,brand",
      });
      setProduct(p as unknown as InvProduct);
      const url = getProductImageUrl(p as unknown as InvProduct, "400x400");
      setImgUrl(url);

      try {
        const bals = await fetchBalances(undefined, productId);
        setBalances(bals);
      } catch { setBalances([]); }

      try {
        setPriceTiers(await fetchProductPriceTiers(productId));
      } catch { setPriceTiers([]); }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { void load(); }, [load]);

  const totalStock = balances.reduce((s, b) => s + (b.qty_on_hand || 0), 0);

  if (loading) {
    return (
      <InventoryGate>
        <InventoryShell title="Detail produk">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        </InventoryShell>
      </InventoryGate>
    );
  }

  if (error || !product) {
    return (
      <InventoryGate>
        <InventoryShell title="Detail produk">
          <div className="py-10 text-center text-slate-500">{error || "Produk tidak ditemukan."}</div>
        </InventoryShell>
      </InventoryGate>
    );
  }

  return (
    <InventoryGate>
      <InventoryShell title="">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <button type="button" onClick={() => router.push("/inventory/products")} className="flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Daftar produk
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Data di bawah berdasarkan tanggal {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}, kecuali ada pernyataan lain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button type="button" onClick={() => router.push(`/inventory/products?edit=${product.id}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Edit2 className="h-4 w-4" />
                Ubah
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Info */}
          <div className="space-y-6 lg:col-span-2">
            {/* Info Produk Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Package className="h-4 w-4" /> Info produk
              </h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Tanggal dibuat" value={product.created ? new Date(product.created).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"} />
                <InfoRow label="Kode produk / SKU" value={product.sku} />
                <InfoRow label="Barcode" value={product.barcode || "—"} />
                <InfoRow label="Stok di gudang" value={`${fmtNum(totalStock)} ${product.uom || "Pcs"}`} />
                <InfoRow label="Batas stok minimum" value={`${fmtNum(product.min_stock)} ${product.uom || "Pcs"}`} />
                <InfoRow label="Kategori produk" value={product.expand?.category?.name ?? "—"} />
                <InfoRow label="Brand" value={product.expand?.brand?.name ?? "—"} />
                <InfoRow label="Deskripsi" value={product.description || "—"} />
                <InfoRow label="Satuan (Unit)" value={product.uom || "Pcs"} />
              </div>
            </div>

            {/* Info Pembelian & Penjualan */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <TrendingDown className="h-4 w-4 text-blue-500" /> Info pembelian
                </h3>
                <div className="mt-4 space-y-3">
                  <InfoRow label="Harga beli satuan" value={fmt(product.buy_price)} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <TrendingUp className="h-4 w-4 text-green-500" /> Info penjualan
                </h3>
                <div className="mt-4 space-y-3">
                  <InfoRow label="Harga jual satuan" value={fmt(product.sell_price)} />
                </div>
              </div>
            </div>

            {/* Harga Grosir */}
            {priceTiers.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Tag className="h-4 w-4 text-indigo-500" /> Harga grosir / perbanyak
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Label</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Min Qty</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Harga</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-100 bg-indigo-50/30">
                        <td className="px-4 py-2.5 font-medium text-slate-700">Satuan</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">1</td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-900">{fmt(product.sell_price)}</td>
                      </tr>
                      {priceTiers.map((t) => (
                        <tr key={t.id} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{t.label}</td>
                          <td className="px-4 py-2.5 text-right text-slate-600">{t.min_qty}+</td>
                          <td className="px-4 py-2.5 text-right font-medium text-green-700">{fmt(t.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stok Per Gudang */}
            {balances.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <PackageOpen className="h-4 w-4" /> Stok per gudang
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Saldo dari <strong>Stok Global</strong> (inv_stock_balances) per gudang — sama dengan penjualan/pembelian.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Gudang</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Tersedia</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Reserved</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((b) => (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{b.expand?.warehouse?.name || b.warehouse}</td>
                          <td className="px-4 py-2.5 text-right text-slate-700">{fmtNum(b.qty_on_hand)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtNum(b.qty_reserved)}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-green-700">{fmtNum(b.qty_available)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right: Image */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {imgUrl ? (
                <img src={imgUrl} alt={product.name} className="w-full rounded-lg object-contain" />
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center rounded-lg bg-slate-50">
                  <Package className="h-16 w-16 text-slate-200" />
                  <p className="mt-2 text-sm text-slate-400">Tidak ada foto</p>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-sm font-semibold text-slate-700">Ringkasan</h4>
              <div className="mt-3 space-y-2.5">
                <QuickStat icon={Layers} label="Total stok" value={`${fmtNum(totalStock)} ${product.uom || "Pcs"}`} />
                <QuickStat icon={TrendingDown} label="Harga beli" value={fmt(product.buy_price)} />
                <QuickStat icon={TrendingUp} label="Harga jual" value={fmt(product.sell_price)} />
                <QuickStat icon={Barcode} label="Barcode" value={product.barcode || "—"} />
                <QuickStat icon={Tag} label="SKU" value={product.sku} />
              </div>
            </div>
          </div>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}
