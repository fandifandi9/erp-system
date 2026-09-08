"use client";

import { useEffect, useState } from "react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  fetchMediaFiles,
  fetchWarehouses,
  saveMediaFile,
} from "@/lib/inventory/client";
import { getErrorMessage } from "@/lib/errors";
import { MEDIA_ENTITY_TYPES, type InvMediaFile, type InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus } from "lucide-react";

export default function InventoryMediaPage() {
  const [items, setItems] = useState<InvMediaFile[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    storage_root: "D:\\ERP_MEDIA",
    relative_path: "",
    original_filename: "",
    mime_type: "image/jpeg",
    entity_type: "movement",
    entity_id: "",
    warehouse: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchMediaFiles());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then(setWarehouses);
    void load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await saveMediaFile({
        ...form,
        warehouse: form.warehouse || undefined,
      });
      setModal(false);
      setForm((f) => ({ ...f, relative_path: "", original_filename: "", entity_id: "" }));
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Foto dokumentasi"
        subtitle="Metadata file di NAS/HDD — file fisik disimpan di storage lokal, bukan di PocketBase."
      >
        <button
          type="button"
          onClick={() => setModal(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
        >
          <Plus className="h-4 w-4" /> Catat path foto
        </button>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Path relatif</th>
                <th className="px-4 py-3 text-left">Entitas</th>
                <th className="px-4 py-3 text-left">Diunggah</th>
                <th className="px-4 py-3 text-left">Verifikasi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Belum ada metadata foto.
                  </td>
                </tr>
              ) : (
                items.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">
                      {m.storage_root}/{m.relative_path}
                    </td>
                    <td className="px-4 py-3">
                      {m.entity_type} / {m.entity_id}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(m.uploaded_at).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">{m.is_verified ? "Ya" : "Belum"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Catat metadata foto</h3>
              <p className="mt-1 text-xs text-slate-500">
                Simpan file ke NAS/HDD dulu, lalu isi path relatif di sini.
              </p>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Root storage (NAS)
                  <input
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.storage_root}
                    onChange={(e) => setForm({ ...form, storage_root: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Path relatif
                  <input
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    placeholder="2026/05/receiving/IMG_001.jpg"
                    value={form.relative_path}
                    onChange={(e) => setForm({ ...form, relative_path: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Tipe entitas
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.entity_type}
                    onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
                  >
                    {MEDIA_ENTITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  ID entitas (mutasi / kemasan / …)
                  <input
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.entity_id}
                    onChange={(e) => setForm({ ...form, entity_id: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Gudang (opsional)
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.warehouse}
                    onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                  >
                    <option value="">—</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code}
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
