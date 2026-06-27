"use client";

import { useState, useEffect, useCallback, useContext } from "react";
import {
  Search, Loader2, ChevronLeft, ChevronRight, Eye, Pencil, Ban, CreditCard,
} from "lucide-react";
import {
  ActionMenuDropdown,
  ActionMenuCloseContext,
} from "@/components/bisnis/ActionMenuDropdown";
import {
  fetchPurchaseBills,
  fetchPurchaseOrders,
  cancelPurchaseBill,
  WMS_ROUTE_FILTER,
  purchaseBillWmsFilterToPb,
  isWmsSchemaFilterError,
  matchesWmsRouteFilter,
} from "@/lib/bisnis/client";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import type { PurchaseBill } from "@/lib/bisnis/types";
import {
  PURCHASE_STATUS_FILTER,
  PURCHASE_STATUS_UI,
  getPurchaseDisplayStatus,
  isCashPurchase,
  purchaseFilterToPb,
  canEditPurchaseBill,
  canCancelPurchaseBill,
} from "@/lib/bisnis/purchase-status";
import { CancelPurchaseModal } from "@/components/bisnis/CancelPurchaseModal";
import { useWorkContext } from "@/components/WorkContextProvider";
import { getErrorMessage } from "@/lib/errors";
import Link from "next/link";
import {
  buildDocSearchFilter,
  PURCHASE_BILL_SEARCH_FIELDS,
} from "@/lib/bisnis/doc-search";
import {
  PURCHASE_BILL_EXPAND,
  resolvePurchaseCompanyName,
} from "@/lib/bisnis/purchase-company-display";
import { useLocale } from "@/components/LocaleProvider";
import { SummaryCard } from "@/components/bisnis/SummaryCard";
import { PURCHASE_MODULE } from "@/lib/bisnis/module-routes";

const PURCHASE_FILTER_KEY: Record<string, string> = {
  all: "purchase.filter.allStatus",
  unpaid: "purchase.filter.unpaid",
  overdue: "purchase.filter.overdue",
  paid: "purchase.filter.paid",
  cancelled: "purchase.filter.cancelled",
};

const WMS_FILTER_KEY: Record<string, string> = {
  all: "purchase.filter.allWms",
  bypass: "purchase.filter.wmsBypass",
  active: "purchase.filter.wmsActive",
  wms_pending: "purchase.filter.wmsPending",
  wms_progress: "purchase.filter.wmsProgress",
  wms_complete: "purchase.filter.wmsComplete",
};

const PURCHASE_STATUS_KEY: Record<string, string> = {
  unpaid: "purchase.filter.unpaid",
  overdue: "purchase.filter.overdue",
  paid: "purchase.filter.paid",
  cancelled: "purchase.filter.cancelled",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const PER_PAGE = 20;

export default function PembelianPage() {
  const { t } = useLocale();
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wmsFilter, setWmsFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectionHint, setCollectionHint] = useState<string | null>(null);

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [billStats, setBillStats] = useState({
    belumBayar: 0,
    belumBayarAmt: 0,
    jatuhTempo: 0,
    jatuhTempoAmt: 0,
    lunas30: 0,
    lunas30Amt: 0,
  });
  const [poOnlyCount, setPoOnlyCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollectionHint(null);
    try {
      const filters: string[] = [];
      const billSearch = buildDocSearchFilter(search, PURCHASE_BILL_SEARCH_FIELDS);
      if (billSearch) filters.push(billSearch);
      const statusPb = purchaseFilterToPb(statusFilter);
      if (statusPb) filters.push(statusPb);
      const wmsPb = purchaseBillWmsFilterToPb(wmsFilter);
      if (wmsPb) filters.push(wmsPb);
      const filterStr = filters.join(" && ") || undefined;

      try {
        let res;
        let clientWmsFilter = false;
        try {
          res = await fetchPurchaseBills({
            page,
            perPage: PER_PAGE,
            sort: "-created",
            filter: filterStr,
            expand: PURCHASE_BILL_EXPAND,
            companyId,
          });
        } catch (e) {
          if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
            const filtersNoWms = filters.filter((f) => f !== wmsPb);
            res = await fetchPurchaseBills({
              page: 1,
              perPage: 200,
              sort: "-created",
              filter: filtersNoWms.join(" && ") || undefined,
              expand: PURCHASE_BILL_EXPAND,
              companyId,
            });
            clientWmsFilter = true;
          } else {
            throw e;
          }
        }
        let billItems = res.items;
        if (clientWmsFilter && wmsFilter !== "all") {
          billItems = billItems.filter((b) =>
            matchesWmsRouteFilter(b.expand?.purchase_order, wmsFilter, "purchase"),
          );
        }
        const billCount = clientWmsFilter && wmsFilter !== "all" ? billItems.length : res.totalItems;
        if (clientWmsFilter && wmsFilter !== "all") {
          const start = (page - 1) * PER_PAGE;
          billItems = billItems.slice(start, start + PER_PAGE);
        }
        setBills(billItems);
        setBillTotal(billCount);

        const all = await fetchPurchaseBills({ page: 1, perPage: 200, sort: "-created", expand: "supplier", companyId });
        const now = new Date();
        const d30 = new Date(now.getTime() - 30 * 86400000);
        let bb = 0, bbA = 0, jt = 0, jtA = 0, l30 = 0, l30A = 0;
        all.items.forEach((bill) => {
          const disp = getPurchaseDisplayStatus(bill);
          if (disp === "cancelled") return;
          if (disp === "unpaid") { bb++; bbA += bill.remaining ?? 0; }
          if (disp === "overdue") { jt++; jtA += bill.remaining ?? 0; }
          if (disp === "paid" && bill.updated && new Date(bill.updated) >= d30) {
            l30++;
            l30A += bill.total ?? 0;
          }
        });
        setBillStats({ belumBayar: bb, belumBayarAmt: bbA, jatuhTempo: jt, jatuhTempoAmt: jtA, lunas30: l30, lunas30Amt: l30A });

        if (billCount === 0) {
          try {
            const poRes = await fetchPurchaseOrders({ page: 1, perPage: 1, companyId });
            setPoOnlyCount(poRes.totalItems);
          } catch {
            setPoOnlyCount(0);
          }
        } else {
          setPoOnlyCount(0);
        }
      } catch (billErr) {
        setBills([]);
        setBillTotal(0);
        const msg = billErr instanceof Error ? billErr.message : t("purchase.list.errLoadBills");
        setCollectionHint(t("purchase.list.collectionHint"));
        setError(msg);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("purchase.list.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, wmsFilter, t, companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, wmsFilter]);

  const totalPages = Math.ceil(billTotal / PER_PAGE);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label={t("purchase.list.summaryUnpaid")} count={billStats.belumBayar} amount={billStats.belumBayarAmt} color="orange" />
        <SummaryCard label={t("purchase.list.summaryOverdue")} count={billStats.jatuhTempo} amount={billStats.jatuhTempoAmt} color="red" />
        <SummaryCard label={t("purchase.list.summaryPaid30")} count={billStats.lunas30} amount={billStats.lunas30Amt} color="green" />
      </div>

      {collectionHint && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {collectionHint}
        </div>
      )}

      {!loading && !error && billTotal === 0 && poOnlyCount > 0 && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {t("purchase.list.poOnlyHint", { count: poOnlyCount })}{" "}
          {t("purchase.list.poOnlyHint2")}{" "}
          <Link href={PURCHASE_MODULE.pesanan} className="font-semibold underline">
            {t("purchase.list.poOnlyTab")}
          </Link>
          .
        </div>
      )}

      {error && !loading && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            {PURCHASE_STATUS_FILTER.map((f) => (
              <option key={f.value} value={f.value}>{t(PURCHASE_FILTER_KEY[f.value] ?? f.value)}</option>
            ))}
          </select>
          <select
            value={wmsFilter}
            onChange={(e) => setWmsFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            {WMS_ROUTE_FILTER.map((f) => (
              <option key={f.value} value={f.value}>
                {t(WMS_FILTER_KEY[f.value] ?? f.value)}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("purchase.list.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-slate-500">{t("common.loading")}</span>
          </div>
        ) : (
          <BillTable data={bills} onCancelled={loadData} />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-xs text-slate-500">{t("purchase.list.pageOf", { page, total: totalPages, count: billTotal })}</p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function BillTable({ data, onCancelled }: { data: PurchaseBill[]; onCancelled: () => void }) {
  const { t } = useLocale();
  if (data.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-sm text-slate-400">
        <p>{t("purchase.list.emptyBill")}</p>
        <p className="mt-2 text-xs">{t("purchase.billList.emptyHint")}</p>
      </div>
    );
  }
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-[5.25rem]" />
        <col className="w-[32%]" />
        <col className="w-[14%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[13%]" />
        <col className="w-[2.25rem]" />
      </colgroup>
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs">
          <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500 sm:pl-4">
            {t("purchase.list.colDate")}
          </th>
          <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
            {t("purchase.list.colDocument")}
          </th>
          <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
            {t("purchase.list.colSupplier")}
          </th>
          <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
            {t("purchase.list.colCompany")}
          </th>
          <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
            {t("purchase.list.colStatus")}
          </th>
          <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-500">
            {t("purchase.list.colBilling")}
          </th>
          <th className="px-1 py-2.5 sm:pr-3" aria-hidden />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.map((bill) => {
          const disp = getPurchaseDisplayStatus(bill);
          const st = PURCHASE_STATUS_UI[disp];
          const cash = isCashPurchase(bill);
          const cancelled = disp === "cancelled";
          const paid = disp === "paid";
          const po = bill.expand?.purchase_order;
          const companyName = resolvePurchaseCompanyName(bill);
          return (
            <tr key={bill.id} className={`align-middle hover:bg-slate-50/70 ${cancelled ? "opacity-55" : ""}`}>
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 sm:pl-4">
                {fmtDate(bill.bill_date)}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/bisnis/pembelian/buat?edit=${bill.id}`}
                  className="block truncate font-semibold text-indigo-600 hover:underline"
                  title={bill.bill_no}
                >
                  {bill.bill_no}
                </Link>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {po?.po_no ? (
                    <Link
                      href={`/bisnis/pembelian/buat?po=${po.id}`}
                      className="truncate font-mono text-sm text-slate-600 hover:text-indigo-600 hover:underline"
                      title={po.po_no}
                    >
                      {po.po_no}
                    </Link>
                  ) : null}
                  <WmsRouteBadge order={po} kind="purchase" />
                </div>
              </td>
              <td className="truncate px-3 py-2.5 text-slate-800" title={bill.expand?.supplier?.name ?? "—"}>
                {bill.expand?.supplier?.name ?? "—"}
              </td>
              <td className="truncate px-3 py-2.5 text-slate-600" title={companyName}>
                {companyName}
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                  {t(PURCHASE_STATUS_KEY[disp] ?? st.label)}
                </span>
                {!paid && !cancelled ? (
                  <p className="mt-1 truncate text-sm tabular-nums text-slate-500">
                    {cash ? t("purchase.list.cashPaid") : fmtDate(bill.due_date)}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                <p className={`font-semibold ${cancelled ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {cancelled ? "—" : fmt(bill.total ?? 0)}
                </p>
                {!cancelled && (bill.remaining ?? 0) > 0 ? (
                  <p className="mt-0.5 truncate text-sm font-medium text-amber-700" title={fmt(bill.remaining ?? 0)}>
                    Sisa {fmt(bill.remaining ?? 0)}
                  </p>
                ) : null}
              </td>
              <td className="px-1 py-2.5 text-center sm:pr-3">
                <PurchaseBillActionMenu bill={bill} onCancelled={onCancelled} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PurchaseBillActionMenu({
  bill,
  onCancelled,
}: {
  bill: PurchaseBill;
  onCancelled: () => void;
}) {
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { t } = useLocale();

  const handleCancel = async (reason: string) => {
    setCancelling(true);
    try {
      await cancelPurchaseBill(bill, reason);
      setShowCancel(false);
      onCancelled();
    } catch (e: unknown) {
      alert(getErrorMessage(e, t("purchase.list.errCancel")));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <ActionMenuDropdown iconOnly>
        <PurchaseBillMenuItems bill={bill} cancelling={cancelling} onCancel={() => setShowCancel(true)} />
      </ActionMenuDropdown>
      <CancelPurchaseModal
        billNo={bill.bill_no}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
      />
    </>
  );
}

function PurchaseBillMenuItems({
  bill,
  cancelling,
  onCancel,
}: {
  bill: PurchaseBill;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const close = useContext(ActionMenuCloseContext);
  const disp = getPurchaseDisplayStatus(bill);
  const canPay =
    disp !== "paid" &&
    disp !== "cancelled" &&
    !isCashPurchase(bill) &&
    (bill.remaining ?? 0) > 0;

  return (
    <>
      <Link href={`/bisnis/pembelian/${bill.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={close}>
        <Eye className="h-3.5 w-3.5" /> {t("purchase.list.viewDetail")}
      </Link>
      {canPay && (
        <Link href={`/bisnis/pembelian/${bill.id}?pay=1`} className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50" onClick={close}>
          <CreditCard className="h-3.5 w-3.5" /> {t("purchase.list.payBill")}
        </Link>
      )}
      {canEditPurchaseBill(bill) && (
        <Link href={`/bisnis/pembelian/buat?edit=${bill.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={close}>
          <Pencil className="h-3.5 w-3.5" /> {t("purchase.list.edit")}
        </Link>
      )}
      {canCancelPurchaseBill(bill) && (
        <button
          type="button"
          disabled={cancelling}
          onClick={() => { close(); onCancel(); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Ban className="h-3.5 w-3.5" /> {t("purchase.list.cancel")}
        </button>
      )}
    </>
  );
}
