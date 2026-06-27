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
  fetchPurchaseOrders,
  fetchStores,
  getPurchaseOrderDocStatus,
  ORDER_DOC_STATUS_UI,
  openPurchaseOrdersListFilterToPb,
  OPEN_ORDER_DOC_STATUS_FILTER,
  WMS_ROUTE_FILTER,
  wmsOrderFilterToPb,
  isWmsSchemaFilterError,
  matchesWmsRouteFilter,
} from "@/lib/bisnis/client";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import type { PurchaseOrder, Store } from "@/lib/bisnis/types";
import { resolveStoreForPurchaseOrder } from "@/lib/bisnis/doc-share";
import { PurchaseOrderShareMenu } from "@/components/bisnis/PurchaseOrderShareMenu";
import { useWorkContext } from "@/components/WorkContextProvider";
import {
  buildDocSearchFilter,
  PURCHASE_ORDER_SEARCH_FIELDS,
} from "@/lib/bisnis/doc-search";
import {
  PURCHASE_ORDER_LIST_EXPAND,
  resolvePurchaseCompanyName,
} from "@/lib/bisnis/purchase-company-display";
import { purchaseQcExceptionBadge } from "@/lib/bisnis/purchase-qc-exception";
import { useLocale } from "@/components/LocaleProvider";

const ORDER_FILTER_KEY: Record<string, string> = {
  all: "purchase.filter.allStatus",
  draft: "purchase.filter.draft",
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

const ORDER_STATUS_KEY: Record<string, string> = {
  draft: "purchase.filter.draft",
  cancelled: "purchase.filter.cancelled",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const PER_PAGE = 20;

export default function PurchaseOrderListPage() {
  const { t } = useLocale();
  const { context: workCtx } = useWorkContext();
  const companyId = workCtx?.companyId;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wmsFilter, setWmsFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [ordTotal, setOrdTotal] = useState(0);
  const [stores, setStores] = useState<Store[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: string[] = [];
      const poSearch = buildDocSearchFilter(search, PURCHASE_ORDER_SEARCH_FIELDS);
      if (poSearch) filters.push(poSearch);
      const statusPb = openPurchaseOrdersListFilterToPb(statusFilter);
      if (statusPb) filters.push(statusPb);
      const wmsPb = wmsOrderFilterToPb(wmsFilter);
      if (wmsPb) filters.push(wmsPb);
      const filterStr = filters.join(" && ") || undefined;

      let res;
      let clientWmsFilter = false;
      try {
        res = await fetchPurchaseOrders({
          page,
          perPage: PER_PAGE,
          sort: "-created",
          filter: filterStr,
          expand: PURCHASE_ORDER_LIST_EXPAND,
          companyId,
        });
      } catch (e) {
        if (wmsFilter !== "all" && isWmsSchemaFilterError(e)) {
          const filtersNoWms = filters.filter((f) => f !== wmsPb);
          res = await fetchPurchaseOrders({
            page: 1,
            perPage: 200,
            sort: "-created",
            filter: filtersNoWms.join(" && ") || undefined,
            expand: PURCHASE_ORDER_LIST_EXPAND,
            companyId,
          });
          clientWmsFilter = true;
        } else {
          throw e;
        }
      }

      let ordItems = res.items;
      if (clientWmsFilter && wmsFilter !== "all") {
        ordItems = ordItems.filter((po) => matchesWmsRouteFilter(po, wmsFilter, "purchase"));
      }
      const ordCount = clientWmsFilter && wmsFilter !== "all" ? ordItems.length : res.totalItems;
      if (clientWmsFilter && wmsFilter !== "all") {
        const start = (page - 1) * PER_PAGE;
        ordItems = ordItems.slice(start, start + PER_PAGE);
      }
      setOrders(ordItems);
      setOrdTotal(ordCount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("purchase.list.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, wmsFilter, t, companyId]);

  useEffect(() => {
    void fetchStores(false)
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, wmsFilter]);

  const totalPages = Math.ceil(ordTotal / PER_PAGE);

  return (
    <>
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
            {OPEN_ORDER_DOC_STATUS_FILTER.map((f) => (
              <option key={f.value} value={f.value}>
                {t(ORDER_FILTER_KEY[f.value] ?? f.value)}
              </option>
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
        ) : orders.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-400">
            <p>{t("purchase.list.emptyOrder")}</p>
            <p className="mt-2 text-xs">{t("purchase.poList.emptyHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 sm:px-6">{t("purchase.list.colDate")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colPoNo")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colSupplier")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colCompany")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colInboundWh")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">{t("purchase.list.colTotal")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colStatus")}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500">{t("purchase.list.colWms")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 sm:px-6">{t("purchase.list.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orders.map((po) => {
                  const doc = getPurchaseOrderDocStatus(po);
                  const st = ORDER_DOC_STATUS_UI[doc];
                  const qcExc = purchaseQcExceptionBadge(po);
                  const poHref = qcExc
                    ? `/bisnis/pembelian/${po.id}`
                    : `/bisnis/pembelian/buat?po=${po.id}`;
                  return (
                    <tr
                      key={po.id}
                      className={`hover:bg-slate-50 ${doc === "cancelled" ? "opacity-60" : ""} ${qcExc ? "bg-amber-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 sm:px-6">{fmtDate(po.order_date)}</td>
                      <td className="px-4 py-3">
                        <Link href={poHref} className="font-mono font-medium text-indigo-600 hover:underline">
                          {po.po_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{po.expand?.supplier?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{resolvePurchaseCompanyName(po)}</td>
                      <td className="px-4 py-3 text-slate-500">{po.expand?.warehouse?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(po.total ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>
                          {t(ORDER_STATUS_KEY[doc] ?? st.label)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <WmsRouteBadge order={po} kind="purchase" />
                          {qcExc ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${qcExc.cls}`}
                            >
                              {qcExc.label}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
                        <PurchaseOrderShareMenu po={po} store={resolveStoreForPurchaseOrder(po, stores)} />
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
            <p className="text-xs text-slate-500">{t("purchase.list.pageOf", { page, total: totalPages, count: ordTotal })}</p>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md p-1.5 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md p-1.5 disabled:opacity-40">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
