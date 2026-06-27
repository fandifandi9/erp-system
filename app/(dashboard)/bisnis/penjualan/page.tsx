"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  fetchInvoices,
  fetchSalesStores,
  fetchRelatedDocIndicatorsByInvoiceIds,
} from "@/lib/bisnis/client";
import {
  INVOICE_ROUTE_FILTER,
  matchesInvoiceRouteFilter,
} from "@/lib/bisnis/invoice-list-display";
import type { Invoice, Store } from "@/lib/bisnis/types";
import { resolveStoreForInvoice } from "@/lib/bisnis/doc-share";
import {
  buildInvoiceStorePbFilter,
  resolveInvoiceStoreName,
} from "@/lib/bisnis/store-scope-filter";
import { fetchWarehouses } from "@/lib/inventory/client";
import { getCachedSalesStores, getCachedWarehouses } from "@/lib/bisnis/master-data-cache";
import { InvoiceShareMenu } from "@/components/bisnis/SalesDocActionMenu";
import { getInvoiceListDisplay } from "@/lib/bisnis/invoice-list-display";
import { useSalesStoreScope } from "@/components/bisnis/SalesStoreScopeContext";
import { SalesModuleTopBar } from "@/components/bisnis/SalesModuleTopBar";
import { SummaryCard } from "@/components/bisnis/SummaryCard";
import {
  INVOICE_STATUS_FILTER,
  INVOICE_STATUS_UI,
  getInvoiceDisplayStatus,
  isCashInvoice,
  statusFilterToPb,
  applyCashInvoiceDisplaySync,
} from "@/lib/bisnis/invoice-status";
import {
  buildDocSearchFilter,
  INVOICE_SEARCH_FIELDS,
} from "@/lib/bisnis/doc-search";
import { useLocale } from "@/components/LocaleProvider";
import { SalesRelatedDocIndicators } from "@/components/bisnis/SalesRelatedDocIndicators";
import type { InvoiceRelatedIndicators } from "@/lib/bisnis/sales-document-chain";

const INVOICE_FILTER_KEY: Record<string, string> = {
  all: "sales.filter.allStatus",
  unpaid: "sales.filter.unpaid",
  overdue: "sales.filter.overdue",
  paid: "sales.filter.paid",
  cancelled: "sales.filter.cancelled",
};

const ROUTE_FILTER_KEY: Record<string, string> = {
  all: "sales.filter.allRoute",
  direct: "sales.filter.routeDirect",
  wms: "sales.filter.routeWms",
};

const INVOICE_STATUS_KEY: Record<string, string> = {
  unpaid: "sales.filter.unpaid",
  overdue: "sales.filter.overdue",
  paid: "sales.filter.paid",
  cancelled: "sales.filter.cancelled",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

function resolveInvoiceCustomerName(inv: Invoice): string {
  return inv.expand?.customer?.name?.trim() || inv.mp_buyer_name?.trim() || "—";
}

function computeSummaryStats(items: Invoice[]) {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  let bb = 0,
    bbA = 0,
    jt = 0,
    jtA = 0,
    l30 = 0,
    l30A = 0;
  items.forEach((inv) => {
    const normalized = applyCashInvoiceDisplaySync(inv);
    const disp = getInvoiceDisplayStatus(normalized);
    if (disp === "cancelled") return;
    if (disp === "unpaid") {
      bb++;
      bbA += normalized.remaining ?? 0;
    }
    if (disp === "overdue") {
      jt++;
      jtA += normalized.remaining ?? 0;
    }
    if (disp === "paid" && normalized.updated && new Date(normalized.updated) >= d30) {
      l30++;
      l30A += normalized.total ?? 0;
    }
  });
  return { belumBayar: bb, belumBayarAmt: bbA, jatuhTempo: jt, jatuhTempoAmt: jtA, lunas30: l30, lunas30Amt: l30A };
}

const PER_PAGE = 20;

export default function SalesInvoiceListPage() {
  const { t } = useLocale();
  const {
    scopeStoreId,
    stores,
    setStores,
    setShownCount,
    totalAllStores,
    setTotalAllStores,
    setNoun,
    setLoading: setScopeLoading,
  } = useSalesStoreScope();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [relatedDocs, setRelatedDocs] = useState<Map<string, InvoiceRelatedIndicators>>(new Map());
  const [invTotal, setInvTotal] = useState(0);
  const [invStats, setInvStats] = useState({
    belumBayar: 0,
    belumBayarAmt: 0,
    jatuhTempo: 0,
    jatuhTempoAmt: 0,
    lunas30: 0,
    lunas30Amt: 0,
  });

  const scopeRef = useRef({ storeList: [] as Store[], warehouseList: [] as Awaited<ReturnType<typeof fetchWarehouses>> });

  const ensureScopeLists = useCallback(async () => {
    const [storeList, warehouseList] = await Promise.all([
      getCachedSalesStores(() => fetchSalesStores().catch(() => [] as Store[])),
      getCachedWarehouses(() => fetchWarehouses(false).catch(() => [])),
    ]);
    scopeRef.current = { storeList, warehouseList };
    setStores(storeList);
    return scopeRef.current;
  }, [setStores]);

  const loadStats = useCallback(async () => {
    try {
      const { storeList, warehouseList } = await ensureScopeLists();
      const statsFilter = scopeStoreId
        ? buildInvoiceStorePbFilter(scopeStoreId, storeList, warehouseList)
        : undefined;

      const [all, allStoresRes] = await Promise.all([
        fetchInvoices({
          page: 1,
          perPage: 200,
          sort: "-created",
          expand: "customer",
          filter: statsFilter,
        }),
        storeList.length > 1
          ? fetchInvoices({ page: 1, perPage: 1, sort: "-created" })
          : Promise.resolve(null),
      ]);

      setInvStats(computeSummaryStats(all.items));
      if (allStoresRes) {
        setTotalAllStores(allStoresRes.totalItems);
      } else {
        setTotalAllStores(all.totalItems);
      }
    } catch {
      /* stats opsional — tabel tetap jalan */
    }
  }, [ensureScopeLists, scopeStoreId, setTotalAllStores]);

  const loadTable = useCallback(async () => {
    setLoading(true);
    setScopeLoading(true);
    setError(null);
    try {
      const { storeList, warehouseList } = await ensureScopeLists();

      const filters: string[] = [];
      const invSearch = buildDocSearchFilter(search, INVOICE_SEARCH_FIELDS);
      if (invSearch) filters.push(invSearch);
      const statusPb = statusFilterToPb(statusFilter);
      if (statusPb) filters.push(statusPb);
      if (scopeStoreId) {
        filters.push(buildInvoiceStorePbFilter(scopeStoreId, storeList, warehouseList));
      }
      const filterStr = filters.join(" && ") || undefined;

      const needRouteClientFilter = routeFilter !== "all";
      const res = await fetchInvoices({
        page: needRouteClientFilter ? 1 : page,
        perPage: needRouteClientFilter ? 200 : PER_PAGE,
        sort: "-created",
        filter: filterStr,
        expand: "customer,sales_order",
      });

      let items = [...res.items];
      if (needRouteClientFilter) {
        items = items.filter((inv) =>
          matchesInvoiceRouteFilter(inv, routeFilter, inv.expand?.sales_order),
        );
      }
      const invCount = needRouteClientFilter ? items.length : res.totalItems;
      if (needRouteClientFilter) {
        const start = (page - 1) * PER_PAGE;
        items = items.slice(start, start + PER_PAGE);
      }

      items = items.map(applyCashInvoiceDisplaySync);

      const indicators = await fetchRelatedDocIndicatorsByInvoiceIds(items.map((i) => i.id)).catch(
        () => new Map<string, InvoiceRelatedIndicators>(),
      );

      setInvoices(items);
      setRelatedDocs(indicators);
      setInvTotal(invCount);
      setShownCount(invCount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
      setScopeLoading(false);
    }
  }, [
    page,
    search,
    statusFilter,
    routeFilter,
    scopeStoreId,
    ensureScopeLists,
    setShownCount,
    setScopeLoading,
  ]);

  useEffect(() => {
    setNoun("penagihan");
  }, [setNoun]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, routeFilter, scopeStoreId]);

  const totalPages = Math.ceil(invTotal / PER_PAGE);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label={t("sales.list.summaryUnpaid")} count={invStats.belumBayar} amount={invStats.belumBayarAmt} color="orange" />
        <SummaryCard label={t("sales.list.summaryOverdue")} count={invStats.jatuhTempo} amount={invStats.jatuhTempoAmt} color="red" />
        <SummaryCard label={t("sales.list.summaryPaid30")} count={invStats.lunas30} amount={invStats.lunas30Amt} color="green" />
      </div>

      {error && !loading && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <SalesModuleTopBar />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            {INVOICE_STATUS_FILTER.map((f) => (
              <option key={f.value} value={f.value}>{t(INVOICE_FILTER_KEY[f.value] ?? f.value)}</option>
            ))}
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            {INVOICE_ROUTE_FILTER.map((f) => (
              <option key={f.value} value={f.value}>{t(ROUTE_FILTER_KEY[f.value] ?? f.label)}</option>
            ))}
          </select>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("sales.list.searchPlaceholder")}
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
        ) : invoices.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            <p>{t("sales.list.emptyInvoice")}</p>
            <p className="mt-2 text-xs">{t("sales.invList.emptyHint")}</p>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[5.25rem]" />
              <col className={stores.length > 1 ? "w-[32%]" : "w-[36%]"} />
              <col className={stores.length > 1 ? "w-[13%]" : "w-[16%]"} />
              {stores.length > 1 ? <col className="w-[11%]" /> : null}
              <col className="w-[12%]" />
              <col className="w-[13%]" />
              <col className="w-[2.25rem]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs">
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500 sm:pl-4">
                  {t("sales.list.colDate")}
                </th>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
                  {t("sales.list.colDocument")}
                </th>
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
                  {t("sales.list.colCustomer")}
                </th>
                {stores.length > 1 ? (
                  <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
                    {t("sales.list.colStore")}
                  </th>
                ) : null}
                <th className="px-3 py-2.5 font-semibold uppercase tracking-wide text-slate-500">
                  {t("sales.list.colStatus")}
                </th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide text-slate-500">
                  {t("sales.list.colBilling")}
                </th>
                <th className="px-1 py-2.5 sm:pr-3" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const disp = getInvoiceDisplayStatus(inv);
                const st = INVOICE_STATUS_UI[disp];
                const cash = isCashInvoice(inv);
                const cancelled = disp === "cancelled";
                const paid = disp === "paid";
                const so = inv.expand?.sales_order;
                const meta = getInvoiceListDisplay(inv, so);
                const pill = "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset";
                return (
                  <tr key={inv.id} className={`align-middle hover:bg-slate-50/70 ${cancelled ? "opacity-55" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600 sm:pl-4">
                      {fmtDate(inv.issue_date)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/bisnis/penjualan/buat?edit=${inv.id}`}
                        className="block truncate font-semibold text-indigo-600 hover:underline"
                        title={inv.invoice_no}
                      >
                        {inv.invoice_no}
                      </Link>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {so?.order_no ? (
                          <Link
                            href={`/bisnis/penjualan/buat?so=${so.id}`}
                            className="truncate font-mono text-sm text-slate-600 hover:text-indigo-600 hover:underline"
                            title={so.order_no}
                          >
                            {so.order_no}
                          </Link>
                        ) : null}
                        <span className={`${pill} bg-slate-100 text-slate-700 ring-slate-200`}>{meta.channelLabel}</span>
                        <span className={`${pill} ${meta.badgeCls}`}>{meta.badgeLabel}</span>
                        <SalesRelatedDocIndicators indicators={relatedDocs.get(inv.id)} />
                      </div>
                    </td>
                    <td className="truncate px-3 py-2.5 text-slate-800" title={resolveInvoiceCustomerName(inv)}>
                      {resolveInvoiceCustomerName(inv)}
                    </td>
                    {stores.length > 1 ? (
                      <td className="truncate px-3 py-2.5 text-slate-600" title={resolveInvoiceStoreName(inv, stores)}>
                        {resolveInvoiceStoreName(inv, stores)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                        {t(INVOICE_STATUS_KEY[disp] ?? st.label)}
                      </span>
                      {!paid && !cancelled ? (
                        <p className="mt-1 truncate text-sm tabular-nums text-slate-500">
                          {cash ? t("sales.list.cashPaid") : fmtDate(inv.due_date)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <p className={`font-semibold ${cancelled ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {cancelled ? "—" : fmt(inv.total ?? 0)}
                      </p>
                      {!cancelled && (inv.remaining ?? 0) > 0 ? (
                        <p className="mt-0.5 truncate text-sm font-medium text-amber-700" title={fmt(inv.remaining ?? 0)}>
                          Sisa {fmt(inv.remaining ?? 0)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-1 py-2.5 text-center sm:pr-3">
                      <InvoiceShareMenu
                        invoice={inv}
                        store={resolveStoreForInvoice(inv, stores)}
                        iconOnly
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-xs text-slate-500">{t("sales.list.pageOf", { page, total: totalPages, count: invTotal })}</p>
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
