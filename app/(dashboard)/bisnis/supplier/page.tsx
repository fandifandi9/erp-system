"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Plus, Pencil, Trash2, Truck, CheckCircle2, X, Loader2,
  AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Supplier } from "@/lib/bisnis/types";
import {
  fetchSuppliers, createSupplier, updateSupplier, deleteSupplier,
} from "@/lib/bisnis/client";

const EMPTY_FORM = {
  code: "", name: "", email: "", phone: "", address: "", city: "",
  contact_person: "", bank_name: "", bank_account: "", tax_id: "", notes: "",
};

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadSuppliers = useCallback(async (pg: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const filter = q ? `name ~ "${q}" || code ~ "${q}"` : "";
      const res = await fetchSuppliers({ page: pg, perPage: 20, filter });
      setSuppliers(res.items);
      setTotalItems(res.totalItems);
      setTotalPages(res.totalPages);
      setPage(res.page);
      const all = await fetchSuppliers({ page: 1, perPage: 1, filter: "is_active = true" });
      setActiveCount(all.totalItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data supplier");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSuppliers(1, search); }, [search, loadSuppliers]);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setForm({
      code: s.code || "", name: s.name || "", email: s.email || "",
      phone: s.phone || "", address: s.address || "", city: s.city || "",
      contact_person: s.contact_person || "", bank_name: s.bank_name || "",
      bank_account: s.bank_account || "", tax_id: s.tax_id || "", notes: s.notes || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus supplier ini?")) return;
    try {
      await deleteSupplier(id);
      loadSuppliers(page, search);
    } catch {
      alert("Gagal menghapus supplier");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { ...form, is_active: true };
      if (editId) {
        await updateSupplier(editId, payload);
      } else {
        await createSupplier(payload);
      }
      setForm(EMPTY_FORM);
      setEditId(null);
      setShowModal(false);
      loadSuppliers(1, search);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "response" in err
        ? JSON.stringify((err as Record<string, unknown>).response)
        : err instanceof Error ? err.message : "Gagal menyimpan supplier";
      alert("Error: " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const set = (key: keyof typeof EMPTY_FORM, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Supplier</h1>
            <p className="mt-1 text-sm text-slate-500">Database supplier dan riwayat pembelian</p>
          </div>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Tambah Supplier
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard icon={Truck} color="indigo" label="Total Supplier" value={totalItems} />
          <StatCard icon={CheckCircle2} color="emerald" label="Supplier Aktif" value={activeCount} />
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Cari supplier..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-xs" />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Kode</th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Nama</th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Contact Person</th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Kota</th>
                      <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Telepon</th>
                      <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-slate-600">Status</th>
                      <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suppliers.map((s) => (
                      <tr key={s.id} className="transition hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-medium text-indigo-600">{s.code}</td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-900">{s.name}</div>
                          <div className="text-xs text-slate-500">{s.email}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-700">{s.contact_person || "-"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{s.city || "-"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{s.phone || "-"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            s.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20"
                          }`}>
                            {s.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => openEdit(s)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(s.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600" title="Hapus">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {suppliers.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">Tidak ada supplier ditemukan.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
                <p className="text-sm text-slate-500">
                  Halaman <span className="font-medium text-slate-700">{page}</span> dari <span className="font-medium text-slate-700">{totalPages}</span> ({totalItems} supplier)
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => loadSuppliers(page - 1, search)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </button>
                  <span className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">{page}</span>
                  <button disabled={page >= totalPages} onClick={() => loadSuppliers(page + 1, search)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
                    Selanjutnya <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Modal Create/Edit ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Supplier" : "Tambah Supplier"}</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setEditId(null); }}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Kode" value={form.code} onChange={(v) => set("code", v)} required />
                <Field label="Nama" value={form.name} onChange={(v) => set("name", v)} required />
                <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
                <Field label="Telepon" value={form.phone} onChange={(v) => set("phone", v)} />
                <Field label="Kota" value={form.city} onChange={(v) => set("city", v)} />
                <Field label="Contact Person" value={form.contact_person} onChange={(v) => set("contact_person", v)} />
                <Field label="Nama Bank" value={form.bank_name} onChange={(v) => set("bank_name", v)} />
                <Field label="No. Rekening" value={form.bank_account} onChange={(v) => set("bank_account", v)} />
                <Field label="NPWP" value={form.tax_id} onChange={(v) => set("tax_id", v)} />
                <div className="sm:col-span-2">
                  <Field label="Alamat" value={form.address} onChange={(v) => set("address", v)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Catatan</label>
                  <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setEditId(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editId ? "Simpan Perubahan" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value }: {
  icon: React.ComponentType<{ className?: string }>; color: "indigo" | "emerald"; label: string; value: number;
}) {
  const bg = color === "indigo" ? "bg-indigo-50" : "bg-emerald-50";
  const text = color === "indigo" ? "text-indigo-600" : "text-emerald-600";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${text}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
    </div>
  );
}
