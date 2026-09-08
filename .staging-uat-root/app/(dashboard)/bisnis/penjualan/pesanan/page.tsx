"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  fetchSalesOrders,
  fetchSalesStores,
  fetchOpenRetursBySalesOrderIds,
  getSalesOrderDocStatus,
  ORDER_DOC_STATUS_UI,
  openSalesOrdersListFilterToPb,
  OPEN_ORDER_DOC_STATUS_FILTER,
  WMS_ROUTE_FILTER,
  wmsOrderFilterToPb,
  isWmsSchemaFilterError,
  matchesWmsRouteFilter,
} from "@/lib/bisnis/client";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import type { SalesOrder, Store, Retur } from "@/lib/bisnis/types";
import { returDisplayForSalesOrder } from "@/lib/bisnis/retur-workflow";
import { resolveStoreForSalesOrder } from "@/lib/bisnis/doc-share";
import {
  buildSalesOrderStorePbFilter,
  resolveSalesOrderStoreName,
} from "@/lib/bisnis/store-scope-filter";
import { fetchWarehouses } from "@/lib/inventory/client";
import { SalesOrderActionMenu } from "@/components/bisnis/SalesDocActionMenu";
import { useSalesStoreScope } from "@/components/bisnis/SalesStoreScopeContext";
import { SalesModuleTopBar } from "@/components/bisnis/SalesModuleTopBar";
import {
  buildDocSearchFilter,
  SALES_ORDER_SEARCH_FIELDS,
} from "@/lib/bisnis/doc-search";
import { useLocale } from "@/components/LocaleProvider";

const ORDER_FILTER_KEY: Record<string, string> = {
  all: "sales.filter.allStatus",
  draft: "sales.filter.draft",
  cancelled: "sales.filter.cancelled",
};

const WMS_FILTER_KEY: Record<string, string> = {
  all: "sales.filter.allWms",
  bypass: "sales.filter.wmsBypass",
  active: "sales.filter.wmsActive",
  wms_pending: "sales.filter.wmsPending",
  wms_progress: "sales.filter.wmsProgress",
  wms_complete: "sales.filter.wmsComplete",
};

const ORDER_STATUS_KEY: Record<string, string> = {
  draft: "sales.filter.draft",
  cancelled: "sales.filter.cancelled",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const PER_PAGE = 20;

export default function SalesOrderListPage() {
  const { t } = useLocale();
  const {
    scopeStoreId,
    setScopeStoreId,
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
  const [wmsFilter, setWmsFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [openReturs, setOpenReturs] = useState<Map<string, Retur>>(new Map());
  const [ordTotal, setOrdTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setScopeLoading(true);
    setError(null);
    try {
      const storeList = await fetchSalesStores().catch(() => [] as Store[]);
      const warehouseList = await fetchWarehouses(false).catch(() => []);
      setStores(storeList);

      const filters: string[] = [];
      const soSearch = buildDocSearchFilter(search, SALES_ORDER_SEARCH_FIELDS);
      if (soSearch) filters.push(soSearch);
      const statusPb = openSalesOrdersListFilterToPb(statusFilter);
      if (statusPb) filters.push(statusPb);
      const wmsPb = wmsOrderFilterToPb(wmsFilter);
      if (wmsPb) filters.push(wmsPb);
      if (scopeStoreId) {
        filters.push(buildSalesOrderStorePbFilter(scopeStoreId, storeList, warehouseList));
      }
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
      setShownCount(ordCount);
      const returMap = await fetchOpenRetursBySalesOrderIds(ordItems.map((o) => o.id));
      setOpenReturs(returMap);

      if (storeList.length > 1) {
        const allRes = await fetchSalesOrders({ page: 1, perPage: 1, sort: "-created" });
        setTotalAllStores(allRes.totalItems);
      } else {
        setTotalAllStores(ordCount);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
      setScopeLoading(false);
    }
  }, [page, search, statusFilter, wmsFilter, scopeStoreId, setStores, setShownCount, setTotalAllStores, setScopeLoading]);

  useEffect(() => {
    setNoun("pesanan");
  }, [setNoun]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, wmsFilter, scopeStoreId]);

  const totalPages = Math.ceil(ordTotal / PER_PAGE);

  return (
    <>
      {error && !loading && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <SalesModuleTopBar />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            {OPEN_ORDER_DOC_STATUS_FILTER.map((f) => (
              <option key={f.value} value={f.value}>{t(ORDER_FILTER_KEY[f.value] ?? f.value)}</option>
            ))}
          </select>
          <select value={wmsFilter} onChange={(e) => setWmsFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            {WMS_ROUTE_FILTER.map((f) => (
              <option key={f.value} value={f.value}>{t(WMS_FILTER_KEY[f.value] ?? f.value)}</option>
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
        ) : orders.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            <p>{t("sales.list.emptyOrder")}</p>
            <p className="mt-2 text-xs">{t("sales.soList.emptyHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">{t("sales.list.colDate")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colOrderNo")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colCustomer")}</th>
                  {stores.length > 1 ? (
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colStore")}</th>
                  ) : null}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">{t("sales.list.colTotal")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colStatus")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colOutboundWh")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.list.colWmsProcess")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("sales.soList.colRetur")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">{t("sales.list.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map((so) => {
                  const doc = getSalesOrderDocStatus(so);
                  const st = ORDER_DOC_STATUS_UI[doc];
                  const cancelled = doc === "cancelled";
                  return (
                    <tr key={so.id} className={`hover:bg-slate-50 ${cancelled ? "opacity-60" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 sm:px-6">{fmtDate(so.order_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/bisnis/penjualan/buat?so=${so.id}`} className="font-medium text-indigo-600 hover:underline">{so.order_no}</Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{so.expand?.customer?.name ?? "—"}</td>
                      {stores.length > 1 ? (
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600" title={resolveSalesOrderStoreName(so, stores)}>
                          {resolveSalesOrderStoreName(so, stores)}
                        </td>
                      ) : null}
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${cancelled ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {cancelled ? "—" : fmt(so.total ?? 0)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{t(ORDER_STATUS_KEY[doc] ?? st.label)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                        {so.expand?.warehouse?.name ?? <span className="text-slate-400">{t("sales.list.warehouseNotSelected")}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <WmsRouteBadge order={so} kind="sales" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {(() => {
                          const open = openReturs.get(so.id);
                          if (!open) return <span className="text-slate-400">—</span>;
                          const disp = returDisplayForSalesOrder(open);
                          return (
                            <Link
                              href={`/bisnis/penjualan/${so.id}`}
                              title={t("sales.returStatus.link", { no: open.retur_no })}
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold hover:underline ${disp.cls}`}
                            >
                              {t(disp.labelId)}
                            </Link>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                        <SalesOrderActionMenu order={so} store={resolveStoreForSalesOrder(so, stores)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6">
            <p className="text-xs text-slate-500">{t("sales.list.pageOf", { page, total: totalPages, count: ordTotal })}</p>
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
