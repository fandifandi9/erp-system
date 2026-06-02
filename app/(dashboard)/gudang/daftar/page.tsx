"use client";

import { useEffect, useState, useCallback } from "react";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvWarehouse } from "@/lib/inventory/types";
import { Loader2, Plus, Pencil, Trash2, Warehouse, X } from "lucide-react";
import { getErrorMessage } from "@/lib/errors";

const EMPTY = { code: "", name: "", address: "", roomsText: "", is_active: true };

export default function DaftarGudangPage() {
  const [items, setItems] = useState<InvWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<InvWarehouse>({
        sort: "code",
        requestKey: null,
      });
      setItems(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY);
    setError("");
    setModal(true);
  };

  const openEdit = (w: InvWarehouse) => {
    setEditId(w.id);
    setForm({
      code: w.code,
      name: w.name,
      address: (w as InvWarehouse & { address?: string }).address || "",
      roomsText: "",
      is_active: w.is_active !== false,
    });
    setError("");
    setModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editId) {
        await pb.collection(INV_COLLECTIONS.warehouses).update(editId, {
          code: form.code.trim().toUpperCase() || form.name.trim().toUpperCase().slice(0, 8),
          name: form.name.trim(),
          address: form.address.trim(),
          is_active: form.is_active,
          timezone: "Asia/Jakarta",
        });
      } else {
        const res = await fetch("/api/inventory/warehouses", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            code: form.code.trim() || undefined,
            address: form.address.trim(),
            roomsText: form.roomsText,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          warehouse?: InvWarehouse;
          roomCount?: number;
        };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || "Gagal membuat gudang");
        }
      }
      setModal(false);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Gagal menyimpan"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus gudang ini?")) return;
    setDeleting(id);
    try {
      await pb.collection(INV_COLLECTIONS.warehouses).delete(id);
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menghapus"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Warehouse className="h-6 w-6 text-indigo-600" /> Daftar Gudang
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Buat gudang sekaligus ruangan — cukup nama, kode dibuat otomatis
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Tambah Gudang
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Warehouse className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Belum ada gudang. Tambahkan gudang pertama Anda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((w) => (
            <div
              key={w.id}
              className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
                    <Warehouse className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{w.name}</h3>
                    <p className="font-mono text-xs text-slate-400">{w.code}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${w.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                >
                  {w.is_active !== false ? "Aktif" : "Nonaktif"}
                </span>
              </div>
              {(w as InvWarehouse & { address?: string }).address ? (
                <p className="mt-3 text-sm text-slate-500">
                  {(w as InvWarehouse & { address?: string }).address}
                </p>
              ) : null}
              <div className="mt-4 flex gap-2 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => openEdit(w)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => void handleDelete(w.id)}
                  disabled={deleting === w.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting === w.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}{" "}
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {editId ? "Edit Gudang" : "Gudang Baru"}
              </h3>
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Nama Gudang <span className="text-red-500">*</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Gudang Utama"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Kode Gudang <span className="font-normal text-slate-400">(opsional)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Kosongkan = otomatis dari nama"
                />
              </label>
              {!editId ? (
                <label className="block text-sm font-medium text-slate-700">
                  Ruangan awal <span className="font-normal text-slate-400">(opsional)</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    rows={4}
                    value={form.roomsText}
                    onChange={(e) => setForm({ ...form, roomsText: e.target.value })}
                    placeholder={"Ruang A\nRuang B\nRuang C"}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Satu nama ruangan per baris. Kode ruangan dibuat otomatis.
                  </span>
                </label>
              ) : null}
              <label className="block text-sm font-medium text-slate-700">
                Alamat
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Jl. Contoh No. 1"
                />
              </label>
              {editId ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Aktif
                </label>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editId ? "Simpan" : "Tambah"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
