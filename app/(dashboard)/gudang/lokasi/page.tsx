"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPinned, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  deactivateLocation,
  deleteLocation,
  fetchProducts,
  fetchWarehouseRooms,
  fetchWarehouseSlotAssignments,
  fetchWarehouses,
  saveWarehouseRoom,
} from "@/lib/inventory/client";
import { INV_COLLECTIONS, type InvLocation, InvProduct, InvWarehouse } from "@/lib/inventory/types";
import { canManageWarehouseLocations } from "@/lib/inventory/access";
import { stripProductFromLocationName } from "@/lib/inventory/slot-product";
import { explainNotWarehouseRoom, listWarehouseRooms } from "@/lib/inventory/warehouse-rooms";
import { suggestRoomCode } from "@/lib/inventory/location-codes";
import { printLocationLabels } from "@/lib/inventory/print-location-label";
import { getErrorMessage } from "@/lib/errors";

const emptyForm = () => ({
  id: "" as string | undefined,
  name: "",
  productToAdd: "",
  codeDisplay: "",
});

export default function GudangLokasiPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageWarehouseLocations(user);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [rooms, setRooms] = useState<InvLocation[]>([]);
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState("");
  const [byRoomId, setByRoomId] = useState<Record<string, { id: string; sku: string; name: string }[]>>({});

  const load = async (whId: string) => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchWarehouseRooms(whId);
      setRooms(list);
      if (list.length === 0) {
        const whRow = await pb.collection(INV_COLLECTIONS.warehouses).getOne(whId, {
          fields: "code",
          requestKey: null,
        });
        const whCode = String((whRow as { code?: string }).code ?? "").trim();
        const all = (await pb.collection(INV_COLLECTIONS.locations).getFullList({
          filter: `warehouse = "${whId}" && is_active = true`,
          fields: "id,code,name,zone_type,level,bin,aisle",
          requestKey: null,
        })) as InvLocation[];
        const skipped = all.filter((loc) => !listWarehouseRooms([loc], whCode).length);
        if (skipped.length > 0) {
          const samples = skipped
            .slice(0, 3)
            .map((loc) => `${loc.code} (${explainNotWarehouseRoom(loc, whCode)})`)
            .join("; ");
          setError(
            `Ada ${skipped.length} lokasi aktif tetapi bukan ruangan: ${samples}. ` +
              `Tambah ruangan baru lewat tombol di atas (kode otomatis, mis. WH009-NAMA untuk gudang ${whCode}).`,
          );
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then((list) => {
      setWarehouses(list);
      if (list[0]) {
        setWarehouseId(list[0].id);
        void load(list[0].id);
      } else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (warehouseId) void load(warehouseId);
  }, [warehouseId]);

  useEffect(() => {
    if (!warehouseId) {
      setByRoomId({});
      return;
    }
    void fetchWarehouseSlotAssignments(warehouseId)
      .then(({ byRoomId: map }) => setByRoomId(map))
      .catch(() => setByRoomId({}));
  }, [warehouseId, saveOk]);

  useEffect(() => {
    void fetchProducts({ page: 1, perPage: 300 })
      .then((res) => setProducts(res.items as unknown as InvProduct[]))
      .catch(() => setProducts([]));
  }, []);

  const openCreate = () => {
    setForm(emptyForm());
    setError("");
    setModal(true);
  };

  const openEdit = (loc: InvLocation) => {
    setForm({
      id: loc.id,
      codeDisplay: loc.code,
      name: stripProductFromLocationName(loc.name ?? "") || loc.code,
      productToAdd: "",
    });
    setError("");
    setModal(true);
  };

  const handleDeactivate = async (loc: InvLocation) => {
    if (!canEdit) return;
    if (!confirm(`Nonaktifkan ruangan ${loc.code}?`)) return;
    try {
      await deactivateLocation(loc.id);
      await load(warehouseId);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleDelete = async (loc: InvLocation) => {
    if (!canEdit) return;
    if (!confirm(`Hapus permanen ruangan ${loc.code}?`)) return;
    try {
      await deleteLocation(loc.id);
      setModal(false);
      await load(warehouseId);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !warehouseId) return;
    const roomName = form.name.trim();
    if (!roomName) {
      alert("Isi nama ruangan.");
      return;
    }
    setSaving(true);
    setError("");
    setSaveOk("");
    try {
      await saveWarehouseRoom({
        id: form.id,
        warehouse: warehouseId,
        name: roomName,
        productId: form.productToAdd || undefined,
      });
      setModal(false);
      setForm(emptyForm());
      setSaveOk("Ruangan berhasil disimpan.");
      await load(warehouseId);
    } catch (err) {
      const msg = getErrorMessage(err, "Gagal menyimpan ruangan");
      setError(msg);
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const wh = warehouses.find((w) => w.id === warehouseId);

  const codePreview = useMemo(() => {
    if (form.id || !form.name.trim() || !wh?.code) return "";
    return suggestRoomCode(
      wh.code,
      form.name,
      rooms.map((r) => r.code),
    );
  }, [form.id, form.name, wh?.code, rooms]);

  const printRoom = (loc: InvLocation) => {
    if (!wh?.code) return;
    printLocationLabels({
      warehouseCode: wh.code,
      warehouseName: wh.name,
      items: [
        {
          code: loc.code,
          name: stripProductFromLocationName(loc.name ?? "") || loc.code,
        },
      ],
    });
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Lokasi Ruangan"
        subtitle="Atur ruangan penyimpanan per gudang. Satu produk bisa ditetapkan per ruangan."
        module="wms"
      >
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
          <p className="font-medium">Cara pakai</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-indigo-800">
            <li>
              Pilih <strong>gudang</strong>, ketik <strong>nama ruangan</strong> saja — kode dibuat otomatis
              (mis. <code>WH009-RUANGA</code>).
            </li>
            <li>
              Satu ruangan bisa berisi <strong>banyak produk</strong>. Tambah produk di form ruangan atau di
              Daftar Produk.
            </li>
            <li>
              Atur penempatan juga dari{" "}
              <Link href="/gudang/produk" className="font-semibold underline">
                Daftar Produk
              </Link>
              .
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Gudang
            <select
              className="mt-1 block min-w-[260px] rounded-lg border border-slate-300 px-3 py-2"
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
          {!loading && warehouseId ? (
            <span className="text-sm text-slate-500">{rooms.length} ruangan</span>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Tambah ruangan
            </button>
          ) : null}
        </div>

        {saveOk ? <p className="text-sm text-green-700">{saveOk}</p> : null}
        {error && !modal ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3 w-28">Label</th>
                {canEdit ? <th className="px-4 py-3 w-24">Aksi</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-slate-500">
                    {wh ? (
                      <>
                        Belum ada ruangan di <strong>{wh.name}</strong>. Klik{" "}
                        <strong>Tambah ruangan</strong>.
                      </>
                    ) : (
                      "Pilih gudang terlebih dahulu."
                    )}
                  </td>
                </tr>
              ) : (
                rooms.map((loc) => {
                  const inRoom = byRoomId[loc.id] ?? [];
                  return (
                    <tr key={loc.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono font-medium text-indigo-700">{loc.code}</td>
                      <td className="px-4 py-3">
                        {stripProductFromLocationName(loc.name ?? "") || loc.code}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {inRoom.length === 0 ? (
                          "—"
                        ) : inRoom.length <= 2 ? (
                          inRoom.map((pr) => `${pr.sku}`).join(", ")
                        ) : (
                          <>
                            {inRoom
                              .slice(0, 2)
                              .map((pr) => pr.sku)
                              .join(", ")}
                            <span className="text-slate-400"> +{inRoom.length - 2} lainnya</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => printRoom(loc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Cetak
                        </button>
                      </td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(loc)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                              title="Ubah ruangan"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeactivate(loc)}
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                              title="Nonaktifkan"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form
              onSubmit={submit}
              className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            >
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <MapPinned className="h-5 w-5 text-indigo-600" />
                {form.id ? "Edit ruangan" : "Ruangan baru"}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Gudang: {wh ? `${wh.code} — ${wh.name}` : "—"}
              </p>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Nama ruangan <span className="text-red-500">*</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ruang A, Cold Storage, dll."
                    required
                    autoFocus
                  />
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kode ruangan</p>
                  <p className="mt-1 font-mono text-indigo-800">
                    {form.id
                      ? form.codeDisplay || "—"
                      : codePreview || "(ketik nama ruangan untuk pratinjau kode)"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {form.id
                      ? "Kode tidak diubah setelah dibuat (hindari bentrok & label QR)."
                      : "Kode unik per gudang — dibuat sistem, tidak perlu diketik manual."}
                  </p>
                </div>
                {form.id && (byRoomId[form.id]?.length ?? 0) > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-800">Produk di ruangan ini</p>
                    <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs">
                      {(byRoomId[form.id] ?? []).map((pr) => (
                        <li key={pr.id} className="flex justify-between gap-2">
                          <span>
                            {pr.sku} — {pr.name}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="text-red-600 hover:underline"
                              onClick={() => {
                                void fetch("/api/inventory/locations/assign-product", {
                                  method: "POST",
                                  credentials: "include",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    warehouse: warehouseId,
                                    productId: pr.id,
                                    roomId: null,
                                  }),
                                }).then(() => setSaveOk("Produk dikeluarkan dari ruangan."));
                              }}
                            >
                              Keluarkan
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <label className="block text-sm">
                  Tambah produk ke ruangan (opsional)
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    value={form.productToAdd}
                    onChange={(e) => setForm({ ...form, productToAdd: e.target.value })}
                  >
                    <option value="">— Tidak menambah —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Produk lain di ruangan yang sama tidak dihapus.
                  </span>
                </label>
              </div>
              <div className="mt-6 flex flex-wrap justify-between gap-2">
                {form.id && canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      const loc = rooms.find((l) => l.id === form.id);
                      if (loc) void handleDelete(loc);
                    }}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    Hapus permanen
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModal(false)}
                    className="rounded-lg border px-4 py-2 text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {saving ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
