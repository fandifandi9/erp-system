"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import type { InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus } from "lucide-react";

export default function InventoryWarehousesPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [items, setItems] = useState<InvWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection(INV_COLLECTIONS.warehouses).getList(1, 50, { sort: "code" });
      setItems(res.items as unknown as InvWarehouse[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      await pb.collection(INV_COLLECTIONS.warehouses).create({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        address: form.address.trim(),
        is_active: true,
        timezone: "Asia/Jakarta",
      });
      setModal(false);
      setForm({ code: "", name: "", address: "" });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title="Gudang" subtitle="Master lokasi gudang untuk stok dan zona kerja.">
        {canEdit ? (
          <button
            type="button"
            onClick={() => setModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> Gudang baru
          </button>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Aktif</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : (
                items.map((w) => (
                  <tr key={w.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono">{w.code}</td>
                    <td className="px-4 py-3">{w.name}</td>
                    <td className="px-4 py-3">{w.is_active !== false ? "Ya" : "Tidak"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Gudang baru</h3>
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
                    required
                  />
                </label>
                <label className="block text-sm">
                  Alamat
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
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
