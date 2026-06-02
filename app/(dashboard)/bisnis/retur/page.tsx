"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RotateCcw,
  Search,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  fetchReturs,
  createRetur,
  fetchAllCustomers,
  fetchAllSuppliers,
} from "@/lib/bisnis/client";
import { assertDocNoAvailable, BIZ_DOC_NUMBER_CONFIG, nextDocNoFor } from "@/lib/bisnis/doc-number";
import { pb } from "@/lib/pocketbase";
import type { Retur, ReturStatus, ReturType, Customer, Supplier } from "@/lib/bisnis/types";

const STATUS_CONFIG: Record<ReturStatus, { label: string; cls: string }> = {
  draft: { label: "Draf", cls: "bg-slate-100 text-slate-600" },
  approved: { label: "Disetujui", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "Selesai", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Dibatalkan", cls: "bg-red-100 text-red-700" },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

export default function ReturPage() {
  const [data, setData] = useState<Retur[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    retur_no: "",
    type: "penjualan" as ReturType,
    customer: "",
    supplier: "",
    warehouse: "",
    reason: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: string[] = [];
      if (search) {
        filters.push(`retur_no ~ "${search}"`);
      }
      const result = await fetchReturs({
        page,
        perPage,
        filter: filters.join(" && "),
        expand: "customer,supplier,warehouse,created_by",
      });
      setData(result.items);
      setTotalItems(result.totalItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalRetur = totalItems;
  const returPenjualan = data.filter((r) => r.type === "penjualan").length;
  const returPembelian = data.filter((r) => r.type === "pembelian").length;

  const stats = [
    { label: "Total Retur", value: String(totalRetur), icon: RotateCcw, color: "bg-slate-100 text-slate-600" },
    { label: "Retur Penjualan", value: String(returPenjualan), icon: ArrowDownLeft, color: "bg-amber-50 text-amber-600" },
    { label: "Retur Pembelian", value: String(returPembelian), icon: ArrowUpRight, color: "bg-blue-50 text-blue-600" },
  ];

  const totalPages = Math.ceil(totalItems / perPage);

  const openModal = async () => {
    let returNo = "";
    try {
      returNo = await nextDocNoFor("ret");
    } catch {
      returNo = "";
    }
    setForm({
      retur_no: returNo,
      type: "penjualan",
      customer: "",
      supplier: "",
      warehouse: "",
      reason: "",
      notes: "",
    });
    try {
      const [c, s, wh] = await Promise.all([
        fetchAllCustomers(),
        fetchAllSuppliers(),
        pb.collection("inv_warehouses").getFullList<{ id: string; name: string; code: string }>({
          sort: "name",
          requestKey: null,
        }),
      ]);
      setCustomers(c);
      setSuppliers(s);
      setWarehouses(wh);
      if (wh.length === 1) setForm((f) => ({ ...f, warehouse: wh[0].id }));
    } catch {
      setCustomers([]);
      setSuppliers([]);
      setWarehouses([]);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const returNo = form.retur_no.trim();
    if (!returNo) {
      alert("Nomor retur wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.ret, returNo);
      await createRetur({
        retur_no: returNo,
        type: form.type,
        customer: form.type === "penjualan" ? form.customer : undefined,
        supplier: form.type === "pembelian" ? form.supplier : undefined,
        warehouse: form.warehouse,
        reason: form.reason || undefined,
        total: 0,
        created_by: pb.authStore.model?.id ?? "",
      });
      setShowModal(false);
      loadData();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? JSON.stringify((e as Record<string, unknown>).response)
          : e instanceof Error ? e.message : "Gagal membuat retur";
      alert(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const typeBadge = (t: ReturType) =>
    t === "penjualan" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <ArrowDownLeft className="h-3 w-3" /> Penjualan
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        <ArrowUpRight className="h-3 w-3" /> Pembelian
      </span>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Retur</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola retur penjualan dan pembelian</p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Buat Retur
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-lg font-bold text-slate-900">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <h2 className="text-lg font-semibold text-slate-800">Daftar Retur</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari no. retur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">No. Retur</th>
                <th className="px-5 py-3">Tipe</th>
                <th className="px-5 py-3">Referensi</th>
                <th className="px-5 py-3">Tanggal</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3">Alasan</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-2 text-sm text-slate-400">Memuat data...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    Tidak ada retur ditemukan.
                  </td>
                </tr>
              ) : (
                data.map((r) => {
                  const ref =
                    r.type === "penjualan"
                      ? (r as Retur & { expand?: { customer?: Customer; supplier?: Supplier } }).expand?.customer?.name
                      : (r as Retur & { expand?: { customer?: Customer; supplier?: Supplier } }).expand?.supplier?.name;
                  const cfg = STATUS_CONFIG[r.status];
                  return (
                    <tr key={r.id} className="border-b border-slate-50 transition hover:bg-slate-50">
                      <td className="whitespace-nowrap px-5 py-3.5 font-medium text-indigo-600">{r.retur_no}</td>
                      <td className="px-5 py-3.5">{typeBadge(r.type)}</td>
                      <td className="px-5 py-3.5 text-slate-700">{ref ?? "-"}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-500">
                        {new Date(r.created).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-medium text-slate-900">
                        {formatCurrency(r.total)}
                      </td>
                      <td className="max-w-[160px] truncate px-5 py-3.5 text-slate-500">{r.reason ?? "-"}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <p className="text-sm text-slate-500">
            Menampilkan {data.length} dari {totalItems} retur
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <span className="text-sm text-slate-600">
              {page} / {totalPages || 1}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Buat Retur Baru</h2>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">No. Retur</label>
                <input
                  type="text"
                  value={form.retur_no}
                  onChange={(e) => setForm({ ...form, retur_no: e.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">Urut RET-0001 … RET-9999 (lalu reset); bisa diubah manual.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Tipe Retur</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ReturType, customer: "", supplier: "" })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="penjualan">Retur Penjualan</option>
                  <option value="pembelian">Retur Pembelian</option>
                </select>
              </div>
              {form.type === "penjualan" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Customer</label>
                  <select
                    value={form.customer}
                    onChange={(e) => setForm({ ...form, customer: e.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Pilih Customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Supplier</label>
                  <select
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Pilih Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700">Gudang</label>
                <select
                  value={form.warehouse}
                  onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Pilih Gudang</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Alasan</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
