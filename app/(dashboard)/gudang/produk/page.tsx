"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchProducts,
  fetchWarehouseSlotAssignments,
  fetchWarehouses,
  getProductImageUrl,
} from "@/lib/inventory/client";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import {
  resolveProductPlacementInWarehouse,
  roomLabel,
  saveProductSlotPlacement,
} from "@/lib/inventory/product-slot-placement";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import type { InvLocation, InvProduct, InvWarehouse } from "@/lib/inventory/types";
import { Loader2, MapPinned, Package, Search, Warehouse } from "lucide-react";

type ProductRow = InvProduct & {
  expand?: InvProduct["expand"] & {
    default_location?: InvLocation;
  };
};


export default function GudangProdukPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageWarehouseLocations(user);
  const [items, setItems] = useState<ProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [rooms, setRooms] = useState<InvLocation[]>([]);
  const [byProductId, setByProductId] = useState<Record<string, InvLocation>>({});
  const [byRoomId, setByRoomId] = useState<Record<string, { id: string; sku: string; name: string }[]>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlyNoLocation, setOnlyNoLocation] = useState(false);
  const [draftLoc, setDraftLoc] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState(false);

  const selectedWh = warehouses.find((w) => w.id === warehouseId);
  const warehouseCode = selectedWh?.code ?? "";

  const loadProducts = useCallback(
    async (search = q) => {
      const res = await fetchProducts({
        q: search,
        page: 1,
        perPage: 200,
        expand: "category,brand,default_location",
      });
      const rows = res.items as unknown as ProductRow[];
      setItems(rows);
      const drafts: Record<string, string> = {};
      for (const p of rows) {
        const placement = resolveProductPlacementInWarehouse(
          p.id,
          warehouseId,
          byProductId,
          p.expand?.default_location ?? null,
          warehouseCode,
        );
        drafts[p.id] = placement?.slotId ?? "";
      }
      setDraftLoc(drafts);
    },
    [q, warehouseId, byProductId, warehouseCode],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const wh = await fetchWarehouses();
        setWarehouses(wh);
        if (wh[0]) setWarehouseId(wh[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!warehouseId) {
      setRooms([]);
      setByProductId({});
      setByRoomId({});
      return;
    }
    void fetchWarehouseSlotAssignments(warehouseId)
      .then(({ rooms: r, byProductId: map, byRoomId: byRoom }) => {
        setRooms(r);
        setByProductId(map);
        setByRoomId(byRoom);
      })
      .catch((e: unknown) => {
        setRooms([]);
        setByProductId({});
        setByRoomId({});
        setToastIsError(true);
        setToast(getErrorMessage(e, "Gagal memuat ruangan gudang"));
      });
  }, [warehouseId]);

  useEffect(() => {
    if (!warehouseId) return;
    setLoading(true);
    void loadProducts(q).finally(() => setLoading(false));
  }, [warehouseId, byProductId, loadProducts, q]);

  const displayedItems = useMemo(() => {
    if (!onlyNoLocation || !warehouseId) return items;
    return items.filter((p) => {
      const placement = resolveProductPlacementInWarehouse(
        p.id,
        warehouseId,
        byProductId,
        p.expand?.default_location ?? null,
        warehouseCode,
      );
      return !placement?.slotId;
    });
  }, [items, onlyNoLocation, warehouseId, byProductId]);

  const stats = useMemo(() => {
    let withLoc = 0;
    let without = 0;
    for (const p of items) {
      const placement = resolveProductPlacementInWarehouse(
        p.id,
        warehouseId,
        byProductId,
        p.expand?.default_location ?? null,
        warehouseCode,
      );
      if (placement?.slotId) withLoc++;
      else without++;
    }
    return { withLoc, without, total: items.length };
  }, [items, warehouseId, byProductId, warehouseCode]);

  const savePlacement = async (productId: string) => {
    const slotId = draftLoc[productId] ?? "";
    if (!slotId) {
      setToastIsError(true);
      setToast("Pilih ruangan terlebih dahulu.");
      return;
    }
    setSavingId(productId);
    setToast(null);
    setToastIsError(false);
    try {
      await saveProductSlotPlacement(warehouseId, productId, slotId || null);
      const { byProductId: map, rooms: r, byRoomId: byRoom } = await fetchWarehouseSlotAssignments(warehouseId);
      setByProductId(map);
      setRooms(r);
      setByRoomId(byRoom);
      setToastIsError(false);
      setToast("Penempatan ruangan disimpan.");
      await loadProducts(q);
    } catch (e: unknown) {
      setToastIsError(true);
      setToast(getErrorMessage(e, "Gagal menyimpan penempatan produk"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Daftar Produk"
        subtitle="Cari produk & atur ruangan penyimpanan per gudang — tanpa stok dan harga."
        module="wms"
      >
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
          <p className="font-medium">Fungsi halaman ini</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-indigo-900">
            <li>
              <strong>Cari produk</strong> — staff gudang pakai SKU, nama, atau barcode.
            </li>
            <li>
              <strong>Penempatan</strong> di{" "}
              <Link href="/gudang/lokasi" className="font-semibold underline">
                Lokasi Ruangan
              </Link>
              . Beberapa produk boleh berada di ruangan yang sama.
            </li>
            <li>
              Stok &amp; harga beli/jual ada di modul lain (
              <Link href="/gudang/stok" className="underline">
                Stok
              </Link>
              ,{" "}
              <Link href="/bisnis/produk" className="underline">
                Bisnis → Produk
              </Link>
              ).
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Warehouse className="h-5 w-5 text-indigo-600" />
            Gudang penempatan
          </div>
          <label className="text-sm text-slate-600">
            <span className="mb-1 block text-xs font-medium text-slate-500">Gudang</span>
            <select
              className="min-w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </label>
          <Link
            href="/gudang/lokasi"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
          >
            <MapPinned className="h-4 w-4" />
            Kelola ruangan
          </Link>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={onlyNoLocation}
              onChange={(e) => setOnlyNoLocation(e.target.checked)}
              className="rounded border-slate-300"
            />
            Hanya produk belum punya ruangan
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Cari SKU / nama / barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadProducts(q)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadProducts(q).finally(() => setLoading(false));
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Cari
          </button>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
            {displayedItems.length} ditampilkan
            {selectedWh ? ` · ${selectedWh.code}` : ""}
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
            {stats.withLoc} sudah ada ruangan
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            {stats.without} belum ada ruangan
          </span>
          {rooms.length === 0 && warehouseId ? (
            <span className="text-amber-800">
              Belum ada ruangan —{" "}
              <Link href="/gudang/lokasi" className="font-semibold underline">
                buat di Lokasi Ruangan
              </Link>
            </span>
          ) : null}
        </div>

        {toast ? (
          <p className={`text-sm ${toastIsError ? "text-red-600" : "text-green-700"}`}>{toast}</p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Barcode</th>
                <th className="hidden px-4 py-3 md:table-cell">Kategori</th>
                <th className="min-w-[220px] px-4 py-3">Ruangan</th>
                <th className="hidden px-4 py-3 lg:table-cell">Nama ruangan</th>
                {canEdit ? <th className="px-4 py-3 w-28" /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                  </td>
                </tr>
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                    {onlyNoLocation
                      ? "Semua produk sudah punya ruangan di gudang ini."
                      : "Tidak ada produk. Coba kata kunci lain."}
                  </td>
                </tr>
              ) : (
                displayedItems.map((p) => {
                  const imgUrl = getProductImageUrl(p, "40x40");
                  const current = resolveProductPlacementInWarehouse(
                    p.id,
                    warehouseId,
                    byProductId,
                    p.expand?.default_location ?? null,
                    warehouseCode,
                  );
                  const draft = draftLoc[p.id] ?? "";
                  const selectedLoc = rooms.find((l) => l.id === draft) ?? current?.slot ?? null;
                  const isSaving = savingId === p.id;
                  const currentLocId = current?.slotId ?? "";
                  return (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {imgUrl ? (
                            <img src={imgUrl} alt="" className="h-9 w-9 rounded-md border object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">
                              <Package className="h-4 w-4 text-slate-400" />
                            </div>
                          )}
                          <span className="font-medium text-slate-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.barcode || "—"}</td>
                      <td className="hidden px-4 py-3 md:table-cell">{p.expand?.category?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <select
                            className="w-full min-w-[180px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                            value={draft}
                            disabled={isSaving || rooms.length === 0}
                            onChange={(e) =>
                              setDraftLoc((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          >
                            <option value="">— Belum diset —</option>
                            {rooms.map((l) => {
                              const count = byRoomId[l.id]?.length ?? 0;
                              return (
                                <option key={l.id} value={l.id}>
                                  {l.code}
                                  {count > 0 ? ` (${count} produk)` : ""}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span className="font-mono text-indigo-700">
                            {selectedLoc?.code ?? "—"}
                          </span>
                        )}
                        {current?.source === "room_assignment" ? (
                          <p className="mt-1 text-[10px] text-emerald-700">Dari Lokasi Ruangan</p>
                        ) : null}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-600 lg:table-cell">
                        {selectedLoc ? roomLabel(selectedLoc) : "—"}
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={isSaving || draft === currentLocId}
                            onClick={() => void savePlacement(p.id)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            {isSaving ? "…" : "Simpan"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          Tip: setelah semua produk punya ruangan, staff bisa cari produk di sini lalu lihat penempatan saat
          picking / putaway / penerimaan.
        </p>
      </InventoryShell>
    </InventoryGate>
  );
}
