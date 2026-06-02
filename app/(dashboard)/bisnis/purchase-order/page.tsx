"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  ClipboardList,
  Truck,
  PackageCheck,
  Banknote,
  Eye,
  MoreHorizontal,
  Printer,
  Filter,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  fetchPurchaseOrders,
  createPurchaseOrder,
  fetchAllSuppliers,
} from "@/lib/bisnis/client";
import {
  assertDocNoAvailable,
  BIZ_DOC_NUMBER_CONFIG,
  docNumberFormatHint,
  nextDocNoFor,
} from "@/lib/bisnis/doc-number";
import { pb } from "@/lib/pocketbase";
import type { PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/lib/bisnis/types";

const STATUS_CONFIG: Record<PurchaseOrderStatus, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700" },
  sent: { label: "Terkirim", bg: "bg-blue-100", text: "text-blue-700" },
  confirmed: { label: "Dikonfirmasi", bg: "bg-indigo-100", text: "text-indigo-700" },
  partial_received: { label: "Diterima Sebagian", bg: "bg-amber-100", text: "text-amber-700" },
  received: { label: "Diterima", bg: "bg-green-100", text: "text-green-700" },
  cancelled: { label: "Dibatalkan", bg: "bg-red-100", text: "text-red-700" },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(value);

export default function PurchaseOrderPage() {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    po_no: "",
    supplier: "",
    warehouse: "",
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: string[] = [];
      if (search) {
        filters.push(`(po_no ~ "${search}" || supplier.name ~ "${search}")`);
      }
      if (statusFilter !== "all") {
        filters.push(`status = "${statusFilter}"`);
      }
      const result = await fetchPurchaseOrders({
        page,
        perPage,
        filter: filters.join(" && "),
        expand: "supplier,warehouse,created_by",
      });
      setData(result.items);
      setTotalItems(result.totalItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPO = totalItems;
  const totalAktif = data.filter(
    (p) => p.status !== "cancelled" && p.status !== "received"
  ).length;
  const totalMenunggu = data.filter(
    (p) => p.status === "confirmed" || p.status === "sent"
  ).length;
  const totalNilai = data.reduce((sum, p) => sum + p.total, 0);

  const stats = [
    { label: "Total PO", value: String(totalPO), icon: ClipboardList, color: "bg-indigo-50 text-indigo-600" },
    { label: "PO Aktif", value: String(totalAktif), icon: Truck, color: "bg-blue-50 text-blue-600" },
    { label: "Menunggu Penerimaan", value: String(totalMenunggu), icon: PackageCheck, color: "bg-amber-50 text-amber-600" },
    { label: "Total Nilai", value: formatCurrency(totalNilai), icon: Banknote, color: "bg-green-50 text-green-600" },
  ];

  const totalPages = Math.ceil(totalItems / perPage);

  const openModal = async () => {
    let poNo = "";
    try {
      poNo = await nextDocNoFor("po");
    } catch {
      poNo = "";
    }
    setForm({
      po_no: poNo,
      supplier: "",
      warehouse: "",
      order_date: new Date().toISOString().slice(0, 10),
      expected_date: "",
      notes: "",
    });
    try {
      const [s, wh] = await Promise.all([
        fetchAllSuppliers(),
        pb.collection("inv_warehouses").getFullList<{ id: string; name: string; code: string }>({
          sort: "name",
          requestKey: null,
        }),
      ]);
      setSuppliers(s);
      setWarehouses(wh);
      if (wh.length === 1) setForm((f) => ({ ...f, warehouse: wh[0].id }));
    } catch {
      setSuppliers([]);
      setWarehouses([]);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const poNo = form.po_no.trim();
    if (!poNo) {
      alert("Nomor PO wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.po, poNo);
      await createPurchaseOrder({
        po_no: poNo,
        supplier: form.supplier,
        warehouse: form.warehouse,
        order_date: form.order_date,
        expected_date: form.expected_date || undefined,
        notes: form.notes || undefined,
        created_by: pb.authStore.model?.id ?? "",
        subtotal: 0,
        tax_amount: 0,
        total: 0,
      });
      setShowModal(false);
      loadData();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? JSON.stringify((e as Record<string, unknown>).response)
          : e instanceof Error ? e.message : "Gagal membuat PO";
      alert(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Purchase Order</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola pesanan pembelian ke supplier</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className={`rounded-lg p-2.5 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="truncate text-2xl font-bold text-slate-900">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari no. PO atau supplier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Semua Status</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Terkirim</option>
                  <option value="confirmed">Dikonfirmasi</option>
                  <option value="partial_received">Diterima Sebagian</option>
                  <option value="received">Diterima</option>
                  <option value="cancelled">Dibatalkan</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              Buat PO Baru
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">No. PO</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                      <p className="mt-2 text-sm text-slate-400">Memuat data...</p>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      Tidak ada purchase order ditemukan.
                    </td>
                  </tr>
                ) : (
                  data.map((po) => {
                    const cfg = STATUS_CONFIG[po.status];
                    return (
                      <tr key={po.id} className="transition hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-medium text-slate-900">
                          {po.po_no}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                          {po.expand?.supplier?.name ?? "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                          {po.order_date
                            ? new Date(po.order_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                            : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                          {po.expected_date
                            ? new Date(po.expected_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                            : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-900">
                          {formatCurrency(po.total)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" title="Lihat" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button type="button" title="Cetak" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                              <Printer className="h-4 w-4" />
                            </button>
                            <button type="button" title="Lainnya" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              Menampilkan {data.length} dari {totalItems} purchase order
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
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Buat Purchase Order Baru</h2>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">No. PO</label>
                <input
                  type="text"
                  value={form.po_no}
                  onChange={(e) => setForm({ ...form, po_no: e.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-slate-500">{docNumberFormatHint("PO")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tanggal Order</label>
                  <input
                    type="date"
                    value={form.order_date}
                    onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Expected Date</label>
                  <input
                    type="date"
                    value={form.expected_date}
                    onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
