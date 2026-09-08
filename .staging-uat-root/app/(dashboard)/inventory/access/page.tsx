"use client";

import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  deleteWarehouseAccess,
  fetchWarehouseAccess,
  fetchWarehouses,
  saveWarehouseAccess,
} from "@/lib/inventory/client";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import type { InvUserWarehouseAccess, InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus, Trash2 } from "lucide-react";

type InvUser = { id: string; email?: string; name?: string; inventory_role?: string };

export default function InventoryAccessPage() {
  const user = pb.authStore.model;
  const canEdit = user && canManageInventoryMaster(user);
  const [items, setItems] = useState<InvUserWarehouseAccess[]>([]);
  const [users, setUsers] = useState<InvUser[]>([]);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ user: "", warehouse: "", is_default: false });

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchWarehouseAccess());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void fetchWarehouses().then(setWarehouses);
    void pb
      .collection("users")
      .getList(1, 200, {
        filter: 'inventory_role != "none" && inventory_role != ""',
        sort: "email",
      })
      .then((res) => setUsers(res.items as unknown as InvUser[]))
      .catch(() => setUsers([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      await saveWarehouseAccess(form);
      setModal(false);
      setForm({ user: "", warehouse: "", is_default: false });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!canEdit || !confirm("Hapus akses gudang ini?")) return;
    try {
      await deleteWarehouseAccess(id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <InventoryGate>
      <InventoryShell
        title="Akses user ↔ gudang"
        subtitle="Petugas inventori hanya operasi di gudang yang di-assign."
      >
        {canEdit ? (
          <button
            type="button"
            onClick={() => setModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
          >
            <Plus className="h-4 w-4" /> Assign gudang
          </button>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Gudang</th>
                <th className="px-4 py-3 text-left">Default</th>
                {canEdit ? <th className="px-4 py-3" /> : null}
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
                items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      {row.expand?.user?.email || row.expand?.user?.name || row.user}
                    </td>
                    <td className="px-4 py-3">
                      {row.expand?.warehouse?.code} — {row.expand?.warehouse?.name}
                    </td>
                    <td className="px-4 py-3">{row.is_default ? "Ya" : "—"}</td>
                    {canEdit ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void remove(row.id)}
                          className="text-red-600 hover:text-red-800"
                          aria-label="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Assign gudang ke user</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Pengguna inventori
                  <select
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.user}
                    onChange={(e) => setForm({ ...form, user: e.target.value })}
                  >
                    <option value="">Pilih user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email || u.name} ({u.inventory_role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Gudang
                  <select
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.warehouse}
                    onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                  >
                    <option value="">Pilih gudang</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  />
                  Gudang default user
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
