"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Plus,
  ChevronDown,
  MoreHorizontal,
  Eye,
  FileText,
  ShoppingBag,
  Pencil,
  Ban,
} from "lucide-react";
import {
  fetchSalesOrders,
  fetchInvoices,
  cancelInvoice,
  syncCashInvoiceStatus,
  getSalesOrderDocStatus,
  canEditSalesOrderDoc,
  ORDER_DOC_STATUS_UI,
  salesOrderFilterToPb,
  ORDER_DOC_STATUS_FILTER,
  WMS_ROUTE_FILTER,
  wmsOrderFilterToPb,
  invoiceWmsFilterToPb,
  isWmsSchemaFilterError,
  matchesWmsRouteFilter,
} from "@/lib/bisnis/client";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import type { SalesOrder, Invoice } from "@/lib/bisnis/types";
import {
  INVOICE_STATUS_FILTER,
  INVOICE_STATUS_UI,
  getInvoiceDisplayStatus,
  isCashInvoice,
  statusFilterToPb,
  canEditInvoice,
  canCancelInvoice,
} from "@/lib/bisnis/invoice-status";
import Link from "next/link";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

type Tab = "penagihan" | "pesanan";
const PER_PAGE = 20;

export default function PenjualanPage() {
  const [tab, setTab] = useState<Tab>("penagihan");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wmsFilter, setWmsFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [ordTotal, setOrdTotal] = useState(0);

  const [invStats, setInvStats] = useState({
    belumBayar: 0,
    belumBayarAmt: 0,
    jatuhTempo: 0,
    jatuhTempoAmt: 0,
    lunas30: 0,
    lunas30Amt: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "penagihan") {
        const filters: string[] = [];
        if (search) filters.push(`(invoice_no ~ "${search}" || customer.name ~ "${search}")`);
        const statusPb = statusFilterToPb(statusFilter);
        if (statusPb) filters.push(statusPb);
        const wmsPb = invoiceWmsFilterToPb(wmsFilter);
        if (wmsPb) filters.push(wmsPb);
        const filterStr = filters.join(" && ") || undefined;

        let res;
        let clientWmsFilter = false;
        try {
          res = await fetchInvoices({
            page,
            perPage: PER_PAGE,
            sort: "-created",
            filter: filterStr,
            expand: "customer,sales_order",
          });
        } catch (e) {
          if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
            const filtersNoWms = filters.filter((f) => f !== wmsPb);
            res = await fetchInvoices({
              page: 1,
              perPage: 200,
              sort: "-created",
              filter: filtersNoWms.join(" && ") || undefined,
              expand: "customer,sales_order",
            });
            clientWmsFilter = true;
          } else {
            throw e;
          }
        }
        let items = [...res.items];
        if (clientWmsFilter && wmsFilter !== "all") {
          items = items.filter((inv) =>
            matchesWmsRouteFilter(inv.expand?.sales_order, wmsFilter, "sales"),
          );
        }
        const invCount = clientWmsFilter && wmsFilter !== "all" ? items.length : res.totalItems;
        if (clientWmsFilter && wmsFilter !== "all") {
          const start = (page - 1) * PER_PAGE;
          items = items.slice(start, start + PER_PAGE);
        }
        for (let i = 0; i < items.length; i++) {
          items[i] = await syncCashInvoiceStatus(items[i]);
        }
        setInvoices(items);
        setInvTotal(invCount);

        const all = await fetchInvoices({ page: 1, perPage: 200, sort: "-created", expand: "customer" });
        const now = new Date();
        const d30 = new Date(now.getTime() - 30 * 86400000);
        let bb = 0,
          bbA = 0,
          jt = 0,
          jtA = 0,
          l30 = 0,
          l30A = 0;
        all.items.forEach((inv) => {
          const disp = getInvoiceDisplayStatus(inv);
          if (disp === "cancelled") return;
          if (disp === "unpaid") {
            bb++;
            bbA += inv.remaining ?? 0;
          }
          if (disp === "overdue") {
            jt++;
            jtA += inv.remaining ?? 0;
          }
          if (disp === "paid" && inv.updated && new Date(inv.updated) >= d30) {
            l30++;
            l30A += inv.total ?? 0;
          }
        });
        setInvStats({
          belumBayar: bb,
          belumBayarAmt: bbA,
          jatuhTempo: jt,
          jatuhTempoAmt: jtA,
          lunas30: l30,
          lunas30Amt: l30A,
        });
      } else {
        const filters: string[] = [];
        if (search) filters.push(`(order_no ~ "${search}" || customer.name ~ "${search}")`);
        const statusPb = salesOrderFilterToPb(statusFilter);
        if (statusPb) filters.push(statusPb);
        const wmsPb = wmsOrderFilterToPb(wmsFilter);
        if (wmsPb) filters.push(wmsPb);
        const filterStr = filters.join(" && ") || undefined;
        let res;
        let clientWmsFilter = false;
        try {
          res = await fetchSalesOrders({
            page,
            perPage: PER_PAGE,
            sort: "-created",
            filter: filterStr,
            expand: "customer,warehouse",
          });
        } catch (e) {
          if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
            const filtersNoWms = filters.filter((f) => f !== wmsPb);
            res = await fetchSalesOrders({
              page: 1,
              perPage: 200,
              sort: "-created",
              filter: filtersNoWms.join(" && ") || undefined,
              expand: "customer,warehouse",
            });
            clientWmsFilter = true;
          } else {
            throw e;
          }
        }
        let ordItems = res.items;
        if (clientWmsFilter && wmsFilter !== "all") {
          ordItems = ordItems.filter((so) => matchesWmsRouteFilter(so, wmsFilter, "sales"));
        }
        const ordCount = clientWmsFilter && wmsFilter !== "all" ? ordItems.length : res.totalItems;
        if (clientWmsFilter && wmsFilter !== "all") {
          const start = (page - 1) * PER_PAGE;
          ordItems = ordItems.slice(start, start + PER_PAGE);
        }
        setOrders(ordItems);
        setOrdTotal(ordCount);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, statusFilter, wmsFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    setPage(1);
    setStatusFilter("all");
    setWmsFilter("all");
    setSearch("");
  }, [tab]);
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, wmsFilter]);

  const totalItems = tab === "penagihan" ? invTotal : ordTotal;
  const totalPages = Math.ceil(totalItems / PER_PAGE);

  return (
    <div className="min-h-screen">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Penjualan</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Buat penjualan baru
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <Link
                    href="/bisnis/penjualan/buat"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4 text-slate-400" />
                    Penagihan Penjualan
                  </Link>
                  <Link
                    href="/bisnis/penjualan/buat"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <ShoppingBag className="h-4 w-4 text-slate-400" />
                    Pesanan Penjualan
                  </Link>
          </div>
              </>
            )}
          </div>
        </div>
      </div>

      {tab === "penagihan" && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Penagihan belum dibayar" count={invStats.belumBayar} amount={invStats.belumBayarAmt} color="orange" />
          <SummaryCard label="Penagihan telah jatuh tempo" count={invStats.jatuhTempo} amount={invStats.jatuhTempoAmt} color="red" />
          <SummaryCard label="Pelunasan diterima 30 hari" count={invStats.lunas30} amount={invStats.lunas30Amt} color="green" />
      </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200">
          <div className="flex gap-0">
            <TabBtn active={tab === "penagihan"} onClick={() => setTab("penagihan")}>
              Penagihan
            </TabBtn>
            <TabBtn active={tab === "pesanan"} onClick={() => setTab("pesanan")}>
              Pesanan
            </TabBtn>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {tab === "penagihan" ? (
              INVOICE_STATUS_FILTER.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))
            ) : (
              ORDER_DOC_STATUS_FILTER.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))
            )}
          </select>
          <select
            value={wmsFilter}
            onChange={(e) => setWmsFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {WMS_ROUTE_FILTER.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
              placeholder="Pencarian…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-slate-500">Memuat…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20">
            <AlertCircle className="h-7 w-7 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={loadData} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              Coba lagi
            </button>
          </div>
        ) : tab === "penagihan" ? (
          <InvoiceTable data={invoices} onCancelled={loadData} />
        ) : (
          <OrderTable data={orders} />
        )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
                <p className="text-xs text-slate-500">
              Halaman {page} dari {totalPages} ({totalItems} data)
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
        )}
      </div>
            </div>
  );
}

function InvoiceTable({ data, onCancelled }: { data: Invoice[]; onCancelled: () => void }) {
  if (data.length === 0) {
    return <div className="px-6 py-16 text-center text-sm text-slate-400">Tidak ada penagihan ditemukan.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">Tanggal</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">No.</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Pelanggan</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Jatuh tempo</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Proses gudang (SO)</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Sisa tagihan</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">Tindakan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((inv) => {
            const disp = getInvoiceDisplayStatus(inv);
            const st = INVOICE_STATUS_UI[disp];
            const cash = isCashInvoice(inv);
            const cancelled = disp === "cancelled";
            return (
              <tr key={inv.id} className={`transition hover:bg-slate-50 ${cancelled ? "opacity-60" : ""}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 sm:px-6">{fmtDate(inv.issue_date)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/bisnis/penjualan/${inv.id}`}
                    className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    {inv.invoice_no}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{inv.expand?.customer?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {cash ? (
                    <span className="text-xs font-medium text-emerald-600">Cash / Lunas</span>
                  ) : (
                    fmtDate(inv.due_date)
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <WmsRouteBadge order={inv.expand?.sales_order} kind="sales" />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                  {cancelled ? "—" : fmt(inv.remaining ?? 0)}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium ${cancelled ? "text-slate-400 line-through" : "text-slate-900"}`}
                >
                  {cancelled ? "—" : fmt(inv.total ?? 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                  <InvoiceActionMenu invoice={inv} onCancelled={onCancelled} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
              </div>
  );
}

function InvoiceActionMenu({ invoice, onCancelled }: { invoice: Invoice; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (
      !confirm(
        `Batalkan invoice ${invoice.invoice_no}? Data tetap tersimpan dan bisa dilihat, tetapi tidak masuk laporan laba rugi.`,
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await cancelInvoice(invoice);
      setOpen(false);
      onCancelled();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal membatalkan");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
              <button
                type="button"
        onClick={() => setOpen(!open)}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Tindakan <MoreHorizontal className="ml-1 inline h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <Link
              href={`/bisnis/penjualan/${invoice.id}`}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <Eye className="h-3.5 w-3.5" /> Lihat / Preview
            </Link>
            {canEditInvoice(invoice) && (
              <Link
                href={`/bisnis/penjualan/buat?edit=${invoice.id}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
            {canCancelInvoice(invoice) && (
              <button
                type="button"
                disabled={cancelling}
                onClick={handleCancel}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Ban className="h-3.5 w-3.5" /> {cancelling ? "Membatalkan…" : "Batalkan"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OrderTable({ data }: { data: SalesOrder[] }) {
  if (data.length === 0) {
    return <div className="px-6 py-16 text-center text-sm text-slate-400">Tidak ada pesanan ditemukan.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">Tanggal</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">No. Order</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Pelanggan</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Gudang keluar</th>
            <th className="px-4 py-3 text-xs font-semibold text-slate-500">Proses gudang</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">Tindakan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((so) => {
            const doc = getSalesOrderDocStatus(so);
            const st = ORDER_DOC_STATUS_UI[doc];
            const editable = canEditSalesOrderDoc(so);
            const cancelled = doc === "cancelled";
            return (
              <tr key={so.id} className={`transition hover:bg-slate-50 ${cancelled ? "opacity-60" : ""}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 sm:px-6">{fmtDate(so.order_date)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <Link href={`/bisnis/penjualan/${so.id}`} className="font-medium text-indigo-600 hover:underline">
                    {so.order_no}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{so.expand?.customer?.name ?? "—"}</td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium ${cancelled ? "text-slate-400 line-through" : "text-slate-900"}`}
                >
                  {cancelled ? "—" : fmt(so.total ?? 0)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                  {so.expand?.warehouse?.name ?? (
                    <span className="text-slate-400">Belum dipilih</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <WmsRouteBadge order={so} kind="sales" />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                  <Link href={`/bisnis/penjualan/${so.id}`} className="text-xs text-indigo-600 hover:underline">
                    {editable ? "Detail" : "Preview"}
                  </Link>
                  {editable ? (
                    <>
                      <span className="mx-2 text-slate-300">|</span>
                      <Link href={`/bisnis/penjualan/buat?so=${so.id}`} className="text-xs text-indigo-600 hover:underline">
                        Edit
                      </Link>
                    </>
                  ) : !cancelled ? (
                    <>
                      <span className="mx-2 text-slate-300">|</span>
                      <Link href={`/bisnis/penjualan/${so.id}`} className="text-xs text-indigo-600 hover:underline">
                        Cetak
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-5 py-3 text-sm font-medium transition ${active ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
    >
      {children}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
    </button>
  );
}

function SummaryCard({
  label,
  count,
  amount,
  color,
}: {
  label: string;
  count: number;
  amount: number;
  color: "orange" | "red" | "green";
}) {
  const styles = {
    orange: "border-l-orange-400 bg-orange-50",
    red: "border-l-red-400 bg-red-50",
    green: "border-l-emerald-400 bg-emerald-50",
  };
  const countBg = {
    orange: "bg-orange-400",
    red: "bg-red-400",
    green: "bg-emerald-400",
  };
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 p-4 ${styles[color]}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${countBg[color]}`}
        >
          {count}
        </span>
      </div>
      <div className="text-xs text-slate-500">Total</div>
      <div className="text-lg font-bold text-slate-900">{fmt(amount)}</div>
    </div>
  );
}
