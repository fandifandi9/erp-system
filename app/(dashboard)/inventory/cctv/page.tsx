"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { fetchCctvCameras, fetchWarehouses, saveCctvCamera } from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import type { InvCctvCamera, InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus } from "lucide-react";

export default function InventoryCctvPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [items, setItems] = useState<InvCctvCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    channel: "",
    nvr_id: "",
    location_label: "",
    playback_hint_url: "",
  });

  const load = async (whId: string) => {
    setLoading(true);
    try {
      setItems(await fetchCctvCameras(whId || undefined));
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
      await saveCctvCamera({ ...form, warehouse: warehouseId });
      setModal(false);
      setForm({
        code: "",
        name: "",
        channel: "",
        nvr_id: "",
        location_label: "",
        playback_hint_url: "",
      });
      await load(warehouseId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Referensi CCTV"
        subtitle="Tanpa video di ERP — hanya kode kamera, channel, dan link playback NVR."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Gudang
            <select
              className="mt-1 block rounded-lg border px-3 py-2"
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
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> Kamera baru
            </button>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Kode</th>
                <th className="px-4 py-3 text-left">Nama</th>
                <th className="px-4 py-3 text-left">Channel</th>
                <th className="px-4 py-3 text-left">Lokasi</th>
                <th className="px-4 py-3 text-left">Playback</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono">{c.code}</td>
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3">{c.channel || "—"}</td>
                    <td className="px-4 py-3">{c.location_label || "—"}</td>
                    <td className="px-4 py-3">
                      {c.playback_hint_url ? (
                        <a
                          href={c.playback_hint_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          Buka NVR
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Kamera CCTV baru</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Kode
                  <input
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Nama
                  <input
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Channel NVR
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.channel}
                    onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Label lokasi
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.location_label}
                    onChange={(e) => setForm({ ...form, location_label: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  URL playback (deep-link NVR)
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.playback_hint_url}
                    onChange={(e) => setForm({ ...form, playback_hint_url: e.target.value })}
                    placeholder="http://192.168.x.x/playback?ch=1"
                  />
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
