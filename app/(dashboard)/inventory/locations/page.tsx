"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchLocations,
  fetchWarehouses,
  saveLocation,
} from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import { LOCATION_ZONE_TYPES, type InvLocation, type InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus } from "lucide-react";

export default function InventoryLocationsPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [items, setItems] = useState<InvLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", zone_type: "rack" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (whId: string) => {
    setLoading(true);
    try {
      setItems(await fetchLocations(whId || undefined, false));
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !warehouseId) return;
    setSaving(true);
    setError("");
    try {
      await saveLocation({ ...form, warehouse: warehouseId });
      setModal(false);
      setForm({ code: "", name: "", zone_type: "rack" });
      await load(warehouseId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Lokasi rak" subtitle="Bin / rak penyimpanan per gudang.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Gudang
            <select
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
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
          {canEdit ? (
            <button
              type="button"
              onClick={() => setModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Lokasi baru
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Tipe</th>
                <th className="px-4 py-3">Aktif</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : (
                items.map((loc) => (
                  <tr key={loc.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono">{loc.code}</td>
                    <td className="px-4 py-3">{loc.name || "—"}</td>
                    <td className="px-4 py-3">{loc.zone_type || "—"}</td>
                    <td className="px-4 py-3">{loc.is_active !== false ? "Ya" : "Tidak"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Lokasi rak baru</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Kode
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Nama
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Tipe
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.zone_type}
                    onChange={(e) => setForm({ ...form, zone_type: e.target.value })}
                  >
                    {LOCATION_ZONE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
