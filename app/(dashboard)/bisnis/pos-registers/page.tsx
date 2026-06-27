"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Monitor } from "lucide-react";
import type { PosRegister } from "@/lib/pos/types";
import { PosRegisterAvatar } from "@/components/pos/PosRegisterAvatar";
import {
  fetchPosRegisters,
  createPosRegister,
  updatePosRegister,
  deletePosRegister,
} from "@/lib/pos/registers";

const EMPTY_FORM = { code: "", name: "", address: "", notes: "" };

export default function PosRegistersPage() {
  const [loading, setLoading] = useState(true);
  const [regs, setRegs] = useState<PosRegister[]>([]);
  const [loadError, setLoadError] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRegs(await fetchPosRegisters(false));
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat terminal POS");
      setRegs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (r: PosRegister) => {
    setEditId(r.id);
    setForm({
      code: r.code,
      name: r.name,
      address: r.address ?? "",
      notes: r.notes ?? "",
    });
    setModal(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editId) await updatePosRegister(editId, payload);
      else await createPosRegister(payload);
      setModal(false);
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Hapus terminal POS ini?")) return;
    try {
      await deletePosRegister(id);
      await load();
    } catch {
      alert("Gagal menghapus terminal");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Master POS</h1>
            <p className="mt-1 text-sm text-slate-500">
              Identitas terminal kasir (kode, nama, alamat). Toko, gudang, dan marketplace dipilih
              saat buka sesi kasir.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Tambah POS
          </button>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : regs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Monitor className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada terminal POS</h3>
            <p className="mt-1 text-sm text-slate-500">Tambah terminal untuk digunakan di Kasir POS</p>
            <button
              type="button"
              onClick={openNew}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Tambah POS
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {regs.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm ${
                  r.is_active ? "border-slate-200" : "border-slate-100 opacity-60"
                }`}
              >
                <PosRegisterAvatar register={r} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  <p className="font-mono text-xs text-slate-500">{r.code}</p>
                  {r.address && <p className="mt-0.5 truncate text-sm text-slate-600">{r.address}</p>}
                  {r.notes && <p className="text-xs text-slate-400">{r.notes}</p>}
                </div>
                <span
                  className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline ${
                    r.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {r.is_active ? "Aktif" : "Nonaktif"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    title="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">{editId ? "Edit terminal" : "Tambah terminal"}</h2>
              <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void save(e)} className="space-y-4 px-6 py-5">
              <div className="flex items-center gap-4">
                <PosRegisterAvatar
                  register={{ code: form.code || "POS", name: form.name || "Terminal" }}
                  size="lg"
                />
                <p className="text-xs text-slate-500">Ikon warna otomatis per kode terminal</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Kode terminal *</label>
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="POS-01"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Nama *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Kasir Depan"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Alamat / lokasi</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Catatan</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : "Simpan"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
