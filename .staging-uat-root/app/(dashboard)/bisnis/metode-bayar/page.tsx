"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Loader2, CreditCard } from "lucide-react";
import type { PaymentMethodSetting } from "@/lib/bisnis/types";
import { fetchPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod } from "@/lib/bisnis/client";

const EMPTY = { name: "" };

export default function MetodeBayarPage() {
  const [items, setItems] = useState<PaymentMethodSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchPaymentMethods(false)); } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditId(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (t: PaymentMethodSetting) => {
    setEditId(t.id);
    setForm({ name: t.name });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus metode pembayaran ini?")) return;
    try { await deletePaymentMethod(id); load(); } catch { alert("Gagal menghapus"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, is_active: true };
      if (editId) await updatePaymentMethod(editId, payload);
      else await createPaymentMethod(payload);
      setShowModal(false); setEditId(null); load();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? JSON.stringify((err as Record<string, unknown>).response)
        : err instanceof Error ? err.message : "Gagal menyimpan";
      alert("Error: " + msg);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Metode Pembayaran</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola metode pembayaran untuk transaksi</p>
          </div>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Tambah Metode
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <CreditCard className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada metode pembayaran</h3>
            <p className="mt-1 text-sm text-slate-500">Buat metode seperti &quot;Transfer Bank&quot;, &quot;Tunai&quot;, &quot;E-Wallet&quot;</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Nama</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">{t.name}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        t.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-slate-500"
                      }`}>{t.is_active ? "Aktif" : "Nonaktif"}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(t.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Metode" : "Tambah Metode"}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Transfer Bank"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditId(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editId ? "Simpan" : "Tambah"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
