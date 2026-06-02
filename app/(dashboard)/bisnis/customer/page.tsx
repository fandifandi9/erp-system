"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, Search, Plus, X, Loader2, UserCheck, Wallet,
  Pencil, Trash2, ChevronLeft, ChevronRight, Crown, UserPlus,
} from "lucide-react";
import {
  fetchCustomers, createCustomer, updateCustomer, deleteCustomer,
} from "@/lib/bisnis/client";
import type { Customer, CustomerType } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";

const fmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 });

const EMPTY_FORM = {
  code: "", name: "", email: "", phone: "", address: "", city: "",
  credit_limit: "", notes: "", customer_type: "regular" as CustomerType,
};

const TYPE_BADGES: Record<CustomerType, { label: string; cls: string }> = {
  member: { label: "Member", cls: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20" },
  regular: { label: "Regular", cls: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20" },
};

export default function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | CustomerType>("");
  const [memberTotal, setMemberTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadCustomers = useCallback(async (p: number, q: string, type: "" | CustomerType = "") => {
    try {
      setLoading(true);
      setError(null);
      const parts: string[] = [];
      if (q.trim()) parts.push(`(name ~ "${q.trim()}" || code ~ "${q.trim()}")`);
      if (type) parts.push(`customer_type = "${type}"`);
      const filter = parts.join(" && ");
      const res = await fetchCustomers({ page: p, perPage: 20, filter });
      setCustomers(res.items);
      setTotalItems(res.totalItems);
      setTotalPages(res.totalPages);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data pelanggan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers(1, search, filterType);
    pb.collection(BISNIS_COLLECTIONS.customers)
      .getList(1, 1, { filter: 'customer_type = "member"', requestKey: null })
      .then((r) => setMemberTotal(r.totalItems))
      .catch(() => setMemberTotal(0));
  }, [loadCustomers, search, filterType]);

  const activeCount = customers.filter((c) => c.is_active).length;
  const totalPiutang = customers.reduce((sum, c) => sum + (c.outstanding_balance ?? 0), 0);

  const openNew = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({
      code: c.code || "", name: c.name || "", email: c.email || "",
      phone: c.phone || "", address: c.address || "", city: c.city || "",
      credit_limit: c.credit_limit ? String(c.credit_limit) : "",
      notes: c.notes || "", customer_type: c.customer_type || "regular",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus pelanggan ini?")) return;
    try {
      await deleteCustomer(id);
      await loadCustomers(page, search, filterType);
    } catch {
      alert("Gagal menghapus pelanggan");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload: Partial<Customer> = {
        code: form.code,
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : undefined,
        notes: form.notes || undefined,
        customer_type: form.customer_type,
        is_active: true,
      };
      if (editId) {
        await updateCustomer(editId, payload);
      } else {
        await createCustomer(payload);
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      await loadCustomers(page, search, filterType);
      pb.collection(BISNIS_COLLECTIONS.customers)
        .getList(1, 1, { filter: 'customer_type = "member"', requestKey: null })
        .then((r) => setMemberTotal(r.totalItems))
        .catch(() => {});
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menyimpan pelanggan"));
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pelanggan</h1>
            <p className="mt-1 text-sm text-slate-500">Database pelanggan, member, dan riwayat transaksi</p>
          </div>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Tambah Pelanggan
          </button>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StatCard icon={Users} color="bg-indigo-50" text="text-indigo-600" label="Total Pelanggan" value={String(totalItems)} />
          <StatCard icon={UserCheck} color="bg-emerald-50" text="text-emerald-600" label="Aktif" value={String(activeCount)} />
          <StatCard icon={Crown} color="bg-amber-50" text="text-amber-600" label="Member" value={String(memberTotal)} />
          <StatCard icon={Wallet} color="bg-blue-50" text="text-blue-600" label="Total Piutang" value={fmt.format(totalPiutang)} />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Cari nama atau kode pelanggan..." value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:max-w-xs" />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as "" | CustomerType)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">Semua Tipe</option>
              <option value="member">Member</option>
              <option value="regular">Regular</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : error ? (
            <div className="px-5 py-12 text-center text-sm text-red-500">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Kode</th>
                    <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Nama</th>
                    <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Kota</th>
                    <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Telepon</th>
                    <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-slate-600">Tipe</th>
                    <th className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-600">Saldo Piutang</th>
                    <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-slate-600">Status</th>
                    <th className="whitespace-nowrap px-5 py-3 text-center font-semibold text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => {
                    const badge = TYPE_BADGES[c.customer_type || "regular"];
                    return (
                    <tr key={c.id} className="transition hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-medium text-indigo-600">{c.code}</td>
                      <td className="px-5 py-3.5">
                          <div className="font-medium text-slate-900">{c.name}</div>
                          {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                      </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{c.city || "-"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{c.phone || "-"}</td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                            {c.customer_type === "member" && <Crown className="h-3 w-3" />}
                            {badge.label}
                          </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-medium text-slate-900">
                        {fmt.format(c.outstanding_balance ?? 0)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            c.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20"
                          }`}>
                          {c.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1">
                            <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                            <button onClick={() => handleDelete(c.id)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600" title="Hapus">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {customers.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">Tidak ada pelanggan ditemukan.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <p className="text-sm text-slate-500">
              Halaman <span className="font-medium text-slate-700">{page}</span> dari <span className="font-medium text-slate-700">{totalPages}</span>
              {" · "}<span className="font-medium text-slate-700">{totalItems}</span> pelanggan
            </p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => loadCustomers(page - 1, search, filterType)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </button>
              <span className="rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">{page}</span>
              <button disabled={page >= totalPages} onClick={() => loadCustomers(page + 1, search, filterType)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                Selanjutnya <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal Create/Edit ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editId ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setEditId(null); }}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kode</label>
                  <input required value={form.code} onChange={(e) => setField("code", e.target.value)} placeholder="CUST-007"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
                  <input required value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="PT Contoh Jaya"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>

                {/* Tipe Pelanggan */}
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Tipe Pelanggan</label>
                  <div className="flex gap-3">
                    <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition ${
                      form.customer_type === "member" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                    }`}>
                      <input type="radio" name="customer_type" value="member" checked={form.customer_type === "member"}
                        onChange={() => setForm((f) => ({ ...f, customer_type: "member" }))} className="sr-only" />
                      <Crown className={`h-5 w-5 ${form.customer_type === "member" ? "text-indigo-600" : "text-slate-400"}`} />
                      <div>
                        <div className={`text-sm font-semibold ${form.customer_type === "member" ? "text-indigo-700" : "text-slate-700"}`}>Member</div>
                        <div className="text-xs text-slate-500">Pelanggan tetap / VIP</div>
                      </div>
                    </label>
                    <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition ${
                      form.customer_type === "regular" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"
                    }`}>
                      <input type="radio" name="customer_type" value="regular" checked={form.customer_type === "regular"}
                        onChange={() => setForm((f) => ({ ...f, customer_type: "regular" }))} className="sr-only" />
                      <UserPlus className={`h-5 w-5 ${form.customer_type === "regular" ? "text-indigo-600" : "text-slate-400"}`} />
                      <div>
                        <div className={`text-sm font-semibold ${form.customer_type === "regular" ? "text-indigo-700" : "text-slate-700"}`}>Regular</div>
                        <div className="text-xs text-slate-500">Pelanggan baru / umum</div>
                      </div>
                  </label>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Telepon</label>
                  <input value={form.phone} onChange={(e) => setField("phone", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
                  <input value={form.address} onChange={(e) => setField("address", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Kota</label>
                  <input value={form.city} onChange={(e) => setField("city", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Limit Kredit</label>
                  <input type="number" value={form.credit_limit} onChange={(e) => setField("credit_limit", e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                  <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
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

function StatCard({ icon: Icon, color, text, label, value }: {
  icon: React.ComponentType<{ className?: string }>; color: string; text: string; label: string; value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className={`h-5 w-5 ${text}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
