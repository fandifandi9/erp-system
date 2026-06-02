"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  MoreHorizontal,
  Download,
  Send,
  Filter,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  fetchInvoices,
  createInvoice,
  fetchAllCustomers,
} from "@/lib/bisnis/client";
import { assertDocNoAvailable, BIZ_DOC_NUMBER_CONFIG, nextDocNoFor } from "@/lib/bisnis/doc-number";
import type { Invoice, Customer, InvoiceStatus } from "@/lib/bisnis/types";

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; bg: string; text: string }
> = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-700" },
  sent: { label: "Terkirim", bg: "bg-blue-100", text: "text-blue-700" },
  paid: { label: "Lunas", bg: "bg-green-100", text: "text-green-700" },
  overdue: { label: "Jatuh Tempo", bg: "bg-red-100", text: "text-red-700" },
  cancelled: { label: "Dibatalkan", bg: "bg-slate-100", text: "text-slate-400" },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(
    value
  );

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    invoice_no: "",
    customer: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    subtotal: 0,
    tax_amount: 0,
    notes: "",
  });

  const [stats, setStats] = useState({
    total: 0,
    paid: 0,
    unpaid: 0,
    overdue: 0,
  });

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let filter = "";
      const filters: string[] = [];

      if (search) {
        filters.push(
          `(invoice_no ~ "${search}" || customer.name ~ "${search}")`
        );
      }
      if (statusFilter !== "all") {
        filters.push(`status = "${statusFilter}"`);
      }
      if (filters.length > 0) {
        filter = filters.join(" && ");
      }

      const result = await fetchInvoices({
        page,
        perPage,
        filter,
        expand: "customer,sales_order",
        sort: "-created",
      });

      setInvoices(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);

      const allForStats = await fetchInvoices({
        page: 1,
        perPage: 1,
        filter: "",
      });
      const paidResult = await fetchInvoices({
        page: 1,
        perPage: 1,
        filter: 'status = "paid"',
      });
      const overdueResult = await fetchInvoices({
        page: 1,
        perPage: 1,
        filter: 'status = "overdue"',
      });
      const unpaidResult = await fetchInvoices({
        page: 1,
        perPage: 1,
        filter: 'status != "paid" && status != "cancelled"',
      });

      setStats({
        total: allForStats.totalItems,
        paid: paidResult.totalItems,
        unpaid: unpaidResult.totalItems,
        overdue: overdueResult.totalItems,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat data invoice");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, statusFilter]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const openModal = async () => {
    let invoiceNo = "";
    try {
      invoiceNo = await nextDocNoFor("inv");
    } catch {
      invoiceNo = "";
    }
    setForm({
      invoice_no: invoiceNo,
      customer: "",
      issue_date: new Date().toISOString().split("T")[0],
      due_date: "",
      subtotal: 0,
      tax_amount: 0,
      notes: "",
    });
    try {
      const list = await fetchAllCustomers();
      setCustomers(list);
    } catch {
      setCustomers([]);
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invoiceNo = form.invoice_no.trim();
    if (!invoiceNo) {
      alert("Nomor invoice wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.inv, invoiceNo);
      const total = form.subtotal + form.tax_amount;
      await createInvoice({
        invoice_no: invoiceNo,
        customer: form.customer,
        issue_date: form.issue_date,
        due_date: form.due_date,
        subtotal: form.subtotal,
        tax_amount: form.tax_amount,
        total,
        remaining: total,
        paid_amount: 0,
        notes: form.notes || undefined,
        created_by: pb.authStore.model?.id,
      });
      setShowModal(false);
      loadInvoices();
    } catch (err: unknown) {
      const detail =
        err && typeof err === "object" && "response" in err
          ? JSON.stringify((err as Record<string, unknown>).response)
          : err instanceof Error ? err.message : "Gagal membuat invoice";
      alert(String(detail));
    } finally {
      setSubmitting(false);
    }
  };

  const statCards = [
    {
      label: "Total Invoice",
      value: stats.total,
      icon: FileText,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Lunas",
      value: stats.paid,
      icon: CheckCircle2,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Belum Lunas",
      value: stats.unpaid,
      icon: Clock,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Jatuh Tempo",
      value: stats.overdue,
      icon: AlertTriangle,
      color: "bg-red-50 text-red-600",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola invoice dan status pembayaran
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className={`rounded-lg p-2.5 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
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
                  placeholder="Cari no. invoice atau customer…"
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
                  <option value="paid">Lunas</option>
                  <option value="overdue">Jatuh Tempo</option>
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
              Buat Invoice
            </button>
          </div>

          {error && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="ml-2 text-sm text-slate-500">Memuat data…</span>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">No. Invoice</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Tanggal</th>
                      <th className="px-4 py-3">Jatuh Tempo</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Dibayar</th>
                      <th className="px-4 py-3 text-right">Sisa</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-4 py-12 text-center text-slate-400"
                        >
                          Tidak ada invoice ditemukan.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((inv) => {
                        const cfg = STATUS_CONFIG[inv.status];
                        return (
                          <tr
                            key={inv.id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-medium text-slate-900">
                              {inv.invoice_no}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-700">
                              {inv.expand?.customer?.name ?? "-"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                              {formatDate(inv.issue_date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                              {formatDate(inv.due_date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-900">
                              {formatCurrency(inv.total)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right text-slate-600">
                              {formatCurrency(inv.paid_amount)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-900">
                              {formatCurrency(inv.remaining)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}
                              >
                                {cfg.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3.5 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  title="Lihat"
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Kirim"
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Download"
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Lainnya"
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                >
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
                  Menampilkan {invoices.length} dari {totalItems} invoice
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <span className="text-sm text-slate-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                Buat Invoice Baru
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    No. Invoice
                  </label>
                  <input
                    type="text"
                    required
                    value={form.invoice_no}
                    onChange={(e) =>
                      setForm({ ...form, invoice_no: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Customer
                  </label>
                  <select
                    required
                    value={form.customer}
                    onChange={(e) =>
                      setForm({ ...form, customer: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Pilih customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tanggal Invoice
                  </label>
                  <input
                    type="date"
                    required
                    value={form.issue_date}
                    onChange={(e) =>
                      setForm({ ...form, issue_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) =>
                      setForm({ ...form, due_date: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Subtotal
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={form.subtotal || ""}
                    onChange={(e) =>
                      setForm({ ...form, subtotal: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Pajak
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.tax_amount || ""}
                    onChange={(e) =>
                      setForm({ ...form, tax_amount: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Total
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={formatCurrency(form.subtotal + form.tax_amount)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Catatan
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
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
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
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
