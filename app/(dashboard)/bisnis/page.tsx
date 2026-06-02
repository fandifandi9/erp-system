"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  Package,
  FileText,
  Truck,
  Boxes,
  Loader2,
  ArrowRight,
  Globe,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { SalesOrder, Invoice } from "@/lib/bisnis/types";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

type Stats = {
  revenue: number;
  activeOrders: number;
  unpaidInvoices: number;
  productsSold: number;
};

const quickLinks = [
  { href: "/bisnis/penjualan", label: "Penjualan", desc: "Sales order & transaksi", icon: ShoppingBag, color: "bg-indigo-50 text-indigo-600" },
  { href: "/bisnis/penjualan-online", label: "Penjualan Online", desc: "Import MP massal + biaya", icon: Globe, color: "bg-violet-50 text-violet-600" },
  { href: "/bisnis/purchase-order", label: "Purchase Order", desc: "Pesanan ke supplier", icon: Truck, color: "bg-blue-50 text-blue-600" },
  { href: "/gudang/stok", label: "Stok Global", desc: "Saldo gudang terpusat", icon: Boxes, color: "bg-emerald-50 text-emerald-600" },
  { href: "/bisnis/invoice", label: "Invoice", desc: "Tagihan & pembayaran", icon: FileText, color: "bg-amber-50 text-amber-600" },
];

export default function DashboardBisnisPage() {
  const [stats, setStats] = useState<Stats>({ revenue: 0, activeOrders: 0, unpaidInvoices: 0, productsSold: 0 });
  const [recentOrders, setRecentOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

      const [ordersRes, invoicesRes, recentRes] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 200, {
          filter: `order_date >= "${monthStart}" && status != "cancelled"`,
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.invoices).getList<Invoice>(1, 200, {
          filter: `status != "paid" && status != "cancelled"`,
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 5, {
          sort: "-created",
          expand: "customer",
          requestKey: null,
        }),
      ]);

      const revenue = ordersRes.items
        .filter((o) => o.status === "delivered" || o.status === "shipped")
        .reduce((sum, o) => sum + (o.total || 0), 0);

      const activeOrders = ordersRes.items.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      ).length;

      const productsSold = ordersRes.items.reduce((sum, o) => sum + (o.total || 0), 0);

      setStats({
        revenue,
        activeOrders,
        unpaidInvoices: invoicesRes.totalItems,
        productsSold: ordersRes.items.length,
      });
      setRecentOrders(recentRes.items);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statCards = [
    { label: "Pendapatan Bulan Ini", value: currency(stats.revenue), icon: TrendingUp, color: "bg-green-50 text-green-600" },
    { label: "Pesanan Aktif", value: String(stats.activeOrders), icon: ShoppingBag, color: "bg-blue-50 text-blue-600" },
    { label: "Invoice Belum Lunas", value: String(stats.unpaidInvoices), icon: AlertTriangle, color: "bg-amber-50 text-amber-600" },
    { label: "Transaksi Bulan Ini", value: String(stats.productsSold), icon: Package, color: "bg-purple-50 text-purple-600" },
  ];

  const statusLabel: Record<string, string> = {
    draft: "Draf", confirmed: "Dikonfirmasi", processing: "Diproses",
    shipped: "Dikirim", delivered: "Selesai", cancelled: "Dibatalkan",
  };
  const statusColor: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600", confirmed: "bg-blue-100 text-blue-700",
    processing: "bg-amber-100 text-amber-700", shipped: "bg-purple-100 text-purple-700",
    delivered: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Dashboard Bisnis</h1>
        <p className="mt-1 text-sm text-slate-500">Ringkasan operasional bisnis SERBA System</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-200 hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className={"flex h-10 w-10 items-center justify-center rounded-xl " + l.color}>
                <l.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition">{l.label}</p>
                <p className="text-xs text-slate-500">{l.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition" />
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-semibold text-slate-800">Pesanan Terbaru</h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada pesanan</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
                  <ShoppingBag className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.order_no}</p>
                  <p className="text-xs text-slate-500">
                    {(o.expand?.customer as Record<string, unknown>)?.name as string || "—"}
                  </p>
                </div>
                <span className={"inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium " + (statusColor[o.status] ?? "bg-slate-100 text-slate-600")}>
                  {statusLabel[o.status] ?? o.status}
                </span>
                <span className="text-sm font-semibold text-slate-900">{currency(o.total || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
