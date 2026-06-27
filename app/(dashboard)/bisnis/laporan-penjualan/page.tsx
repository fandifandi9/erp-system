"use client";

import { useEffect, useState, useCallback } from "react";
import { BarChart3, TrendingUp, ShoppingBag, Users, Download, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Invoice } from "@/lib/bisnis/types";
import { getInvoiceDisplayStatus, invoiceAmountForPL, INVOICE_STATUS_UI } from "@/lib/bisnis/invoice-status";
import { downloadSalesReportXlsx } from "@/lib/export/sales-report-xlsx";
import { buildReportFilter, reportDimensionSummary } from "@/lib/bisnis/report-filters";
import { useReportDimensions } from "@/lib/bisnis/use-report-dimensions";
import { ReportDimensionFilters } from "@/components/bisnis/ReportDimensionFilters";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

type MonthData = { month: string; value: number };
type TopItem = { name: string; count: number; total: number };

export default function LaporanPenjualanPage() {
  const {
    companyId,
    companyName,
    stores,
    warehouses,
    channels,
    storeId,
    setStoreId,
    warehouseId,
    setWarehouseId,
    channelId,
    setChannelId,
    dimensions,
  } = useReportDimensions();

  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [avgOrder, setAvgOrder] = useState(0);
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopItem[]>([]);
  const [transactions, setTransactions] = useState<Invoice[]>([]);
  const [exportInvoices, setExportInvoices] = useState<Invoice[]>([]);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];

      const filter = buildReportFilter(`issue_date >= "${yearStart}"`, {
        companyId,
        storeId,
        warehouseId,
        channelId,
        warehouseField: "sales_order.warehouse",
      });

      const invoices = await pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
        filter,
        expand: "customer",
        sort: "-issue_date",
        requestKey: null,
      });
      setTransactions(invoices.slice(0, 50));
      setExportInvoices(invoices);

      const activeInv = invoices.filter((i) => getInvoiceDisplayStatus(i) !== "cancelled");
      const rev = activeInv.reduce((s, o) => s + invoiceAmountForPL(o), 0);
      setTotalRevenue(rev);
      setTotalOrders(activeInv.length);
      setAvgOrder(activeInv.length > 0 ? rev / activeInv.length : 0);

      const custSet = new Set(activeInv.map((o) => o.customer));
      setCustomerCount(custSet.size);

      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      const monthMap = new Map<number, number>();
      for (const o of activeInv) {
        const m = new Date(o.issue_date).getMonth();
        monthMap.set(m, (monthMap.get(m) || 0) + invoiceAmountForPL(o));
      }
      const md: MonthData[] = [];
      for (let i = 0; i <= now.getMonth(); i++) {
        md.push({ month: months[i], value: monthMap.get(i) || 0 });
      }
      setMonthlyData(md);

      const custTotals = new Map<string, { name: string; count: number; total: number }>();
      for (const o of activeInv) {
        const cname = o.expand?.customer?.name || o.customer;
        const existing = custTotals.get(o.customer) || { name: cname, count: 0, total: 0 };
        existing.count++;
        existing.total += invoiceAmountForPL(o);
        custTotals.set(o.customer, existing);
      }
      setTopCustomers(
        Array.from(custTotals.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)
      );
    } catch (err) {
      console.error("Laporan load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, storeId, warehouseId, channelId]);

  useEffect(() => { load(); }, [load]);

  const dimSummary = reportDimensionSummary(dimensions, { stores, warehouses, channels });

  const handleExportExcel = async () => {
    if (exportInvoices.length === 0) return;
    setExporting(true);
    try {
      await downloadSalesReportXlsx(
        exportInvoices.map((inv) => {
          const disp = getInvoiceDisplayStatus(inv);
          const st = INVOICE_STATUS_UI[disp];
          return {
            issue_date: inv.issue_date,
            invoice_no: inv.invoice_no,
            customer_name: inv.expand?.customer?.name ?? "—",
            status_label: st.label,
            total: disp === "cancelled" ? null : inv.total ?? 0,
          };
        })
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Gagal export Excel");
    } finally {
      setExporting(false);
    }
  };

  const maxVal = Math.max(...monthlyData.map((d) => d.value), 1);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const stats = [
    { label: "Penjualan Tahun Ini", value: currency(totalRevenue), icon: TrendingUp, color: "bg-green-50 text-green-600" },
    { label: "Total Transaksi", value: String(totalOrders), icon: ShoppingBag, color: "bg-blue-50 text-blue-600" },
    { label: "Customer Aktif", value: String(customerCount), icon: Users, color: "bg-purple-50 text-purple-600" },
    { label: "Rata-rata Order", value: currency(avgOrder), icon: BarChart3, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Laporan Penjualan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Analisis penjualan dan tren customer
            {dimSummary ? ` · ${dimSummary}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleExportExcel()}
          disabled={exporting || exportInvoices.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </button>
      </div>

      <ReportDimensionFilters
        companyName={companyName}
        stores={stores}
        warehouses={warehouses}
        channels={channels}
        storeId={storeId}
        onStoreChange={setStoreId}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        channelId={channelId}
        onChannelChange={setChannelId}
        showStore
        showWarehouse
        showChannel
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={"flex h-10 w-10 items-center justify-center rounded-xl " + s.color}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-lg font-bold text-slate-900 truncate">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {monthlyData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Tren Penjualan Bulanan</h2>
          <div className="flex items-end gap-3 h-48">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">
                  {d.value >= 1_000_000 ? currency(d.value / 1_000_000) + " jt" : currency(d.value)}
                </span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all min-h-[4px]"
                  style={{ height: `${Math.max((d.value / maxVal) * 100, 2)}%` }}
                />
                <span className="text-xs text-slate-500">{d.month}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Top Customer</h2>
        </div>
        {topCustomers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada data</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {topCustomers.map((c, i) => (
              <div key={c.name} className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-50 text-xs font-bold text-purple-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.count} transaksi</p>
                </div>
                <span className="text-sm font-semibold text-slate-900">{currency(c.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Log Transaksi</h2>
          <p className="text-xs text-slate-500 mt-1">Termasuk dibatalkan (tanpa nominal di total)</p>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada transaksi</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500">Tanggal</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500">No. Invoice</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500">Pelanggan</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.map((inv) => {
                  const disp = getInvoiceDisplayStatus(inv);
                  const st = INVOICE_STATUS_UI[disp];
                  const cancelled = disp === "cancelled";
                  return (
                    <tr key={inv.id} className={cancelled ? "opacity-60" : ""}>
                      <td className="px-5 py-3 text-slate-600">
                        {new Date(inv.issue_date).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3 font-medium text-indigo-600">{inv.invoice_no}</td>
                      <td className="px-5 py-3 text-slate-700">{inv.expand?.customer?.name ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className={`px-5 py-3 text-right font-medium ${cancelled ? "text-slate-400" : "text-slate-900"}`}>
                        {cancelled ? "—" : currency(inv.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
