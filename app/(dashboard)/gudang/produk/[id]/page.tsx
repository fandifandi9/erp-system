"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  Package,
  Barcode,
  Tag,
  Layers,
  PackageOpen,
  MapPinned,
} from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchBalances,
  fetchRackMasters,
  fetchWarehouses,
  getProductImageUrl,
  saveProduct,
} from "@/lib/inventory/client";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import type { InvLocation, InvWarehouse } from "@/lib/inventory/types";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS, type InvProduct, type InvStockBalance } from "@/lib/inventory/types";
import { getErrorMessage } from "@/lib/errors";
import { formatIntegerId } from "@/lib/format-number";

export default function GudangProdukDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;

  const [product, setProduct] = useState<InvProduct | null>(null);
  const [balances, setBalances] = useState<InvStockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [locations, setLocations] = useState<InvLocation[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState("");
  const [locationWarehouseId, setLocationWarehouseId] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);
  const [locMsg, setLocMsg] = useState("");

  const user = pb.authStore.model;
  const canEditLoc = user && canManageWarehouseLocations(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await pb.collection(INV_COLLECTIONS.products).getOne<InvProduct>(productId, {
        expand: "category,brand,default_location",
      });
      setProduct(p as unknown as InvProduct);
      setDefaultLocationId(p.default_location ?? "");
      setImgUrl(getProductImageUrl(p as unknown as InvProduct, "400x400"));
      setBalances(await fetchBalances(undefined, productId));
      const wh = await fetchWarehouses();
      setWarehouses(wh);
      if (wh[0]) setLocationWarehouseId(wh[0].id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!locationWarehouseId) {
      setLocations([]);
      return;
    }
    void fetchRackMasters(locationWarehouseId).then(setLocations);
  }, [locationWarehouseId]);

  const saveDefaultLocation = async () => {
    if (!product || !canEditLoc) return;
    setSavingLoc(true);
    setLocMsg("");
    try {
      await saveProduct({
        id: product.id,
        sku: product.sku,
        name: product.name,
        default_location: defaultLocationId || "",
      });
      setLocMsg("Lokasi default disimpan.");
      await load();
    } catch (err) {
      setLocMsg(getErrorMessage(err));
    } finally {
      setSavingLoc(false);
    }
  };

  const totalStock = balances.reduce((s, b) => s + (b.qty_on_hand || 0), 0);
  const selectedLoc = locations.find((l) => l.id === defaultLocationId);

  if (loading) {
    return (
      <InventoryGate>
        <InventoryShell title="Detail produk" module="wms">
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        </InventoryShell>
      </InventoryGate>
    );
  }

  if (error || !product) {
    return (
      <InventoryGate>
        <InventoryShell title="Detail produk" module="wms">
          <p className="text-center text-slate-500">{error || "Produk tidak ditemukan."}</p>
        </InventoryShell>
      </InventoryGate>
    );
  }

  return (
    <InventoryGate>
      <InventoryShell title="" module="wms">
        <button
          type="button"
          onClick={() => router.push("/gudang/produk")}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Daftar produk gudang
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
            <p className="mt-1 text-sm text-slate-500">Master pusat — tampilan operasional (tanpa harga)</p>
          </div>
          <Link
            href={`/bisnis/produk`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ubah di Manajemen Bisnis
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">Identitas</h3>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info label="SKU" value={product.sku} />
                <Info label="Barcode" value={product.barcode || "—"} />
                <Info label="Kategori" value={product.expand?.category?.name || "—"} />
                <Info label="Brand" value={product.expand?.brand?.name || "—"} />
                <Info label="Satuan" value={product.uom || "pcs"} />
                <Info label="Stok minimum" value={formatIntegerId(product.min_stock)} />
              </dl>
              {product.description ? (
                <p className="mt-4 text-sm text-slate-600">{product.description}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-6 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <MapPinned className="h-4 w-4 text-indigo-600" />
                Lokasi penyimpanan (putaway)
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Dipakai saat penerimaan barang untuk mengarahkan staff ke rak yang benar.
              </p>
              {canEditLoc ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm">
                    Gudang
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={locationWarehouseId}
                      onChange={(e) => setLocationWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} — {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Lokasi rak default
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={defaultLocationId}
                      onChange={(e) => setDefaultLocationId(e.target.value)}
                    >
                      <option value="">— Belum dipilih —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code}
                          {l.name ? ` — ${l.name}` : ""}
                          {l.aisle ? ` · ${l.aisle}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {locations.length === 0 && locationWarehouseId ? (
                    <p className="text-xs text-amber-800">
                      Belum ada rak di gudang ini.{" "}
                      <Link href="/gudang/lokasi" className="font-semibold underline">
                        Buat lokasi rak
                      </Link>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={savingLoc}
                    onClick={() => void saveDefaultLocation()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {savingLoc ? "Menyimpan…" : "Simpan lokasi produk"}
                  </button>
                  {locMsg ? <p className="text-xs text-slate-600">{locMsg}</p> : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">—</p>
              )}
              {selectedLoc ? (
                <dl className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium">Kode</dt>
                    <dd className="font-mono">{selectedLoc.code}</dd>
                  </div>
                  {selectedLoc.aisle ? (
                    <div>
                      <dt className="font-medium">Gang / ruang</dt>
                      <dd>{selectedLoc.aisle}</dd>
                    </div>
                  ) : null}
                  {selectedLoc.level ? (
                    <div>
                      <dt className="font-medium">Tingkat</dt>
                      <dd>{selectedLoc.level}</dd>
                    </div>
                  ) : null}
                  {selectedLoc.bin ? (
                    <div>
                      <dt className="font-medium">Bin</dt>
                      <dd>{selectedLoc.bin}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>

            {balances.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <PackageOpen className="h-4 w-4" /> Stok per gudang
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="pb-2">Gudang</th>
                        <th className="pb-2 text-right">On hand</th>
                        <th className="pb-2 text-right">Reserved</th>
                        <th className="pb-2 text-right">Tersedia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((b) => (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="py-2 font-medium">
                            {b.expand?.warehouse?.name || b.warehouse}
                          </td>
                          <td className="py-2 text-right">{formatIntegerId(b.qty_on_hand)}</td>
                          <td className="py-2 text-right">{formatIntegerId(b.qty_reserved)}</td>
                          <td className="py-2 text-right text-emerald-700">
                            {formatIntegerId(b.qty_available)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              {imgUrl ? (
                <img src={imgUrl} alt={product.name} className="w-full rounded-lg object-contain" />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg bg-slate-50">
                  <Package className="h-16 w-16 text-slate-200" />
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <QuickStat icon={Layers} label="Total stok" value={`${formatIntegerId(totalStock)} ${product.uom || "pcs"}`} />
              <QuickStat icon={Barcode} label="Barcode" value={product.barcode || "—"} />
              <QuickStat icon={Tag} label="SKU" value={product.sku} />
            </div>
          </div>
        </div>
      </InventoryShell>
    </InventoryGate>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-slate-100 py-2.5 last:border-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}
