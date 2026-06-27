"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Landmark,
  ArrowDownUp,
  PieChart,
  Wallet,
  Receipt,
  CreditCard,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Invoice, PurchaseBill, Expense } from "@/lib/bisnis/types";
import { ModuleHubPage } from "@/components/module/ModuleHubPage";
import type { Payment } from "@/lib/bisnis/client";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavSection } from "@/lib/i18n/nav-catalog";
import { navItemsToHubLinks } from "@/lib/module/nav-to-hub";
import { KEUANGAN_NAV_ITEMS } from "@/lib/wms/navigation";
import { mergeCompanyFilter } from "@/lib/bisnis/entity-resolve";
import { useWorkContext } from "@/components/WorkContextProvider";

const currency = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

type FinanceStats = {
  piutang: number;
  piutangCount: number;
  hutang: number;
  hutangCount: number;
  pengeluaranBulan: number;
  kasMasukBulan: number;
};

export default function KeuanganPage() {
  const { locale, t } = useLocale();
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FinanceStats>({
    piutang: 0,
    piutangCount: 0,
    hutang: 0,
    hutangCount: 0,
    pengeluaranBulan: 0,
    kasMasukBulan: 0,
  });

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const [invoices, bills, expenses, payments] = await Promise.all([
        pb.collection(BISNIS_COLLECTIONS.invoices).getFullList<Invoice>({
          filter: mergeCompanyFilter(`status != "paid" && status != "cancelled"`, companyId),
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.purchaseBills).getFullList<PurchaseBill>({
          filter: mergeCompanyFilter(`status != "paid" && status != "cancelled"`, companyId),
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.expenses).getFullList<Expense>({
          filter: mergeCompanyFilter(
            `expense_date >= "${monthStart}" && expense_date <= "${monthEnd}" && status != "cancelled" && status != "draft"`,
            companyId,
          ),
          requestKey: null,
        }),
        pb.collection(BISNIS_COLLECTIONS.payments).getFullList<Payment>({
          filter: mergeCompanyFilter(
            `payment_date >= "${monthStart}" && payment_date <= "${monthEnd}"`,
            companyId,
          ),
          requestKey: null,
        }),
      ]);

      const piutang = invoices.reduce((sum, inv) => sum + (inv.remaining ?? 0), 0);
      const hutang = bills.reduce((sum, b) => sum + (b.remaining ?? 0), 0);
      const pengeluaranBulan = expenses.reduce((sum, e) => sum + (e.total ?? e.amount ?? 0), 0);
      const kasMasukBulan = payments
        .filter((p) => p.payment_kind !== "refund")
        .reduce((sum, p) => sum + (p.amount ?? 0), 0);

      setStats({
        piutang,
        piutangCount: invoices.length,
        hutang,
        hutangCount: bills.length,
        pengeluaranBulan,
        kasMasukBulan,
      });
    } catch (err) {
      console.error("Keuangan dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const hubLinks = useMemo(
    () => navItemsToHubLinks(KEUANGAN_NAV_ITEMS, "/keuangan", locale).slice(1),
    [locale],
  );

  const linksWithStats = useMemo(
    () =>
      hubLinks.map((link) => {
        if (link.href === "/keuangan/piutang" && stats.piutangCount > 0) {
          return {
            ...link,
            description: t("hubs.keuangan.unpaidInvoices", { count: stats.piutangCount }),
          };
        }
        if (link.href === "/keuangan/hutang" && stats.hutangCount > 0) {
          return {
            ...link,
            description: t("hubs.keuangan.unpaidBills", { count: stats.hutangCount }),
          };
        }
        return link;
      }),
    [hubLinks, stats.piutangCount, stats.hutangCount, t],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleHubPage
        title={translateNavSection(locale, "keuangan", "Keuangan")}
        subtitle={t("hubs.keuangan.subtitle")}
        stats={[
          {
            label: t("hubs.keuangan.totalReceivables"),
            value: currency(stats.piutang),
            icon: TrendingUp,
            color: "bg-emerald-50 text-emerald-600",
          },
          {
            label: t("hubs.keuangan.totalPayables"),
            value: currency(stats.hutang),
            icon: TrendingDown,
            color: "bg-red-50 text-red-600",
          },
          {
            label: t("hubs.keuangan.cashInMonth"),
            value: currency(stats.kasMasukBulan),
            icon: Landmark,
            color: "bg-blue-50 text-blue-600",
          },
          {
            label: t("hubs.keuangan.expenseMonth"),
            value: currency(stats.pengeluaranBulan),
            icon: Wallet,
            color: "bg-amber-50 text-amber-600",
          },
        ]}
        links={linksWithStats}
      />

      {(stats.piutangCount > 0 || stats.hutangCount > 0) && (
        <div className="mx-auto max-w-7xl rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">{t("hubs.keuangan.paymentAlert")}</p>
              <p className="mt-1 text-amber-800">
                {stats.piutangCount > 0 && (
                  <>
                    {t("hubs.keuangan.alertInvoices", {
                      count: stats.piutangCount,
                      amount: currency(stats.piutang),
                    })}{" "}
                    <Link href="/keuangan/piutang" className="font-medium underline underline-offset-2">
                      {t("hubs.keuangan.viewReceivables")}
                    </Link>
                  </>
                )}
                {stats.piutangCount > 0 && stats.hutangCount > 0 ? " · " : null}
                {stats.hutangCount > 0 && (
                  <>
                    {t("hubs.keuangan.alertBills", {
                      count: stats.hutangCount,
                      amount: currency(stats.hutang),
                    })}{" "}
                    <Link href="/keuangan/hutang" className="font-medium underline underline-offset-2">
                      {t("hubs.keuangan.viewPayables")}
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
