"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Package,
  ShoppingBag,
  Truck,
  Warehouse,
  Monitor,
  Users,
  Wallet,
  BarChart3,
  Settings,
  LayoutDashboard,
  Loader2,
  TrendingUp,
  Receipt,
  Clock,
} from "lucide-react";
import { MissedCheckoutReminderBanner } from "@/components/MissedCheckoutReminderBanner";
import { ActivityFeedPanel } from "@/components/ActivityFeedPanel";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/sales-warehouse";

const modules = [
  { href: "/katalog", sectionKey: "katalog", icon: Package, color: "bg-indigo-50 text-indigo-600" },
  { href: "/penjualan", sectionKey: "penjualan", icon: ShoppingBag, color: "bg-violet-50 text-violet-600" },
  { href: "/pembelian", sectionKey: "pembelian", icon: Truck, color: "bg-blue-50 text-blue-600" },
  { href: "/gudang", sectionKey: "gudang", icon: Warehouse, color: "bg-emerald-50 text-emerald-600" },
  { href: "/pos", sectionKey: "pos", icon: Monitor, color: "bg-cyan-50 text-cyan-600" },
  { href: "/staff", sectionKey: "sdm", icon: Users, color: "bg-amber-50 text-amber-600" },
  { href: "/keuangan", sectionKey: "keuangan", icon: Wallet, color: "bg-rose-50 text-rose-600" },
  { href: "/laporan", sectionKey: "laporan", icon: BarChart3, color: "bg-teal-50 text-teal-600" },
  { href: "/pengaturan", sectionKey: "pengaturan", icon: Settings, color: "bg-slate-100 text-slate-700" },
] as const;

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function Page() {
  const { locale, t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    salesToday: 0,
    salesTodayTotal: 0,
    piutangCount: 0,
    piutangTotal: 0,
    wmsQueue: 0,
    attendancePresent: 0,
    attendanceLate: 0,
  });

  const loadKpis = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const attStart = new Date(now);
      attStart.setHours(0, 0, 0, 0);
      const attEnd = new Date(now);
      attEnd.setHours(23, 59, 59, 999);

      const [salesRes, piutangRes, wmsRes, presentRes, lateRes] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 200, {
          filter: `order_date >= "${dayStart}" && status != "cancelled"`,
          fields: "total",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 200, {
          filter: '(payment_status = "unpaid" || payment_status = "partial") && status != "cancelled"',
          fields: "total",
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.salesOrders).getList(1, 1, {
          filter: salesOrdersPickingPbFilter(),
          requestKey: null,
        }),
        pb.collection("attendance_logs").getList(1, 1, {
          filter: `status="present" && created >= "${attStart.toISOString()}" && created <= "${attEnd.toISOString()}"`,
          requestKey: null,
        }),
        pb.collection("attendance_logs").getList(1, 1, {
          filter: `status="late" && created >= "${attStart.toISOString()}" && created <= "${attEnd.toISOString()}"`,
          requestKey: null,
        }),
      ]);

      setKpis({
        salesToday: salesRes.totalItems,
        salesTodayTotal: salesRes.items.reduce((s, o) => s + (Number((o as { total?: number }).total) || 0), 0),
        piutangCount: piutangRes.totalItems,
        piutangTotal: piutangRes.items.reduce((s, o) => s + (Number((o as { total?: number }).total) || 0), 0),
        wmsQueue: wmsRes.totalItems,
        attendancePresent: presentRes.totalItems,
        attendanceLate: lateRes.totalItems,
      });
    } catch (err) {
      console.error("Dashboard owner KPI:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("dashboard.ownerTitle")}</h1>
          <p className="text-sm text-slate-500">{t("dashboard.ownerSubtitle")}</p>
        </div>
      </div>

      <MissedCheckoutReminderBanner />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Link
            href="/bisnis/penjualan"
            className="rounded-2xl border border-violet-200 bg-violet-50 p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-xs text-violet-700">
              <TrendingUp className="h-3.5 w-3.5" />
              {t("dashboard.salesToday")}
            </div>
            <p className="mt-1 text-xl font-bold text-violet-900">{t("dashboard.orderCount", { count: fmt(kpis.salesToday) })}</p>
            <p className="text-xs text-violet-700">{fmtMoney(kpis.salesTodayTotal)}</p>
          </Link>
          <Link
            href="/keuangan/piutang"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-xs text-rose-700">
              <Receipt className="h-3.5 w-3.5" />
              {t("dashboard.openReceivables")}
            </div>
            <p className="mt-1 text-xl font-bold text-rose-900">{t("dashboard.invoiceCount", { count: fmt(kpis.piutangCount) })}</p>
            <p className="text-xs text-rose-700">{fmtMoney(kpis.piutangTotal)}</p>
          </Link>
          <Link
            href="/wms/permintaan-barang/picking"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <Warehouse className="h-3.5 w-3.5" />
              {t("dashboard.wmsQueue")}
            </div>
            <p className="mt-1 text-xl font-bold text-emerald-900">{fmt(kpis.wmsQueue)}</p>
            <p className="text-xs text-emerald-700">{t("dashboard.wmsOrders")}</p>
          </Link>
          <Link
            href="/hr/attendance"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              {t("dashboard.attendanceToday")}
            </div>
            <p className="mt-1 text-xl font-bold text-amber-900">{t("dashboard.presentCount", { count: fmt(kpis.attendancePresent) })}</p>
            <p className="text-xs text-amber-700">{t("dashboard.lateCount", { count: fmt(kpis.attendanceLate) })}</p>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${m.color}`}>
              <m.icon className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600">
              {translateNavSection(locale, m.sectionKey, m.sectionKey)}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityFeedPanel />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        <p>
          {t("dashboard.attendanceHintPrefix")}
          <strong className="text-slate-800">{t("dashboard.nativeApp")}</strong>
          {t("dashboard.attendanceHintMiddle")}
          <strong className="text-slate-800">{t("dashboard.yourName")}</strong>
          {t("dashboard.attendanceHintSuffix")}
          <Link href="/profile" className="font-medium text-indigo-600 underline-offset-2 hover:underline">
            {t("dashboard.profile")}
          </Link>
          .
        </p>
        </div>
      </div>
    </div>
  );
}
