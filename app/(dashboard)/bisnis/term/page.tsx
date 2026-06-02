"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Loader2, CalendarClock, Star } from "lucide-react";
import type { PaymentTerm } from "@/lib/bisnis/types";
import { fetchPaymentTerms, createPaymentTerm, updatePaymentTerm, deletePaymentTerm } from "@/lib/bisnis/client";

const EMPTY = { name: "", days: 0, is_default: false };

export default function TermPage() {
  const [items, setItems] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchPaymentTerms(false)); } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditId(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (t: PaymentTerm) => {
    setEditId(t.id);
    setForm({ name: t.name, days: t.days, is_default: t.is_default });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus term ini?")) return;
    try { await deletePaymentTerm(id); load(); } catch { alert("Gagal menghapus"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, is_active: true };
      if (editId) await updatePaymentTerm(editId, payload);
      else await createPaymentTerm(payload);
      setShowModal(false); setEditId(null); load();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? JSON.stringify((err as Record<string, unknown>).response)
        : err instanceof Error ? err.message : "Gagal menyimpan";
      alert("Error: " + msg);
    } finally { setSubmitting(false); }
  };

  const previewDueDate = () => {
    if (!form.days) return "";
    const d = new Date();
    d.setDate(d.getDate() + form.days);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Term Pembayaran</h1>
            <p className="mt-1 text-sm text-slate-500">Atur jangka waktu pembayaran — jatuh tempo dihitung otomatis</p>
          </div>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Tambah Term
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <CalendarClock className="mx-auto h-12 w-12 text-slate-200" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">Belum ada term</h3>
            <p className="mt-1 text-sm text-slate-500">Buat term seperti &quot;Net 30&quot; (30 hari), &quot;Net 15&quot;, dsb.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50">
                      <CalendarClock className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {t.is_default && <Star className="h-4 w-4 text-amber-500 fill-amber-400" />}
                    <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(t.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center">
                  <p className="text-3xl font-bold text-slate-900">{t.days}</p>
                  <p className="text-xs text-slate-500">hari</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    t.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-slate-500"
                  }`}>{t.is_active ? "Aktif" : "Nonaktif"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Term" : "Tambah Term"}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Net 30 Hari"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah Hari <span className="text-red-500">*</span></label>
                <input required type="number" min="0" max="365" value={form.days} onChange={(e) => setForm({ ...form, days: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                {form.days > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    Jika transaksi hari ini, jatuh tempo: <span className="font-semibold text-indigo-600">{previewDueDate()}</span>
                  </p>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                Jadikan term default
              </label>
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
