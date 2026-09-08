"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, RefreshCw, Printer } from "lucide-react";
import type { SalesOrder } from "@/lib/bisnis/types";
import { WmsCard, WmsSectionTitle } from "@/components/wms/ui";
import { describeOrderForQueue } from "@/lib/wms/outbound-queues";
import { fetchMissingInvoiceNos } from "@/lib/wms/enrich-queue-invoices";
import {
  getWmsStageSinceIso,
  getWmsStageWaitMinutes,
  type WmsTimeDisplayMode,
  wmsStageWaitToneClass,
} from "@/lib/wms/wms-queue-time";
import { useLocale } from "@/components/LocaleProvider";
import { wasPkAutoPrinted } from "@/lib/wms/pk-print-tracker";
import {
  formatWmsStageWaitLineLocalized,
  getPickupGateLabel,
  getWmsStageLabel,
} from "@/lib/i18n/wms-formatters";
import { pkCodeBody } from "@/lib/wms/pk-number";

type Props = {
  title: string;
  subtitle: string;
  orders: SalesOrder[];
  selectedId?: string;
  loading: boolean;
  emptyText: string;
  onSelect: (so: SalesOrder) => void;
  /** active = menit/jam di tahap ini; history = tanggal selesai */
  timeMode?: WmsTimeDisplayMode;
  /** Mode multi-paket: centang untuk batch serah terima */
  batchIds?: string[];
  onToggleBatch?: (so: SalesOrder) => void;
  /** Muat ulang antrean (mis. ambil pesanan baru). */
  onRefresh?: () => void;
  /** Cetak ulang slip PK satu order (ikon printer per baris). */
  onPrintOrder?: (so: SalesOrder) => void;
  /** Aktifkan checkbox pilih + cetak manual banyak sekaligus. */
  printSelectable?: boolean;
  printSelectedIds?: string[];
  onTogglePrintSelect?: (so: SalesOrder) => void;
  onSelectAllPrint?: (ids: string[], selectAll: boolean) => void;
  onPrintSelected?: () => void;
  /** Isi tinggi kolom — daftar scroll internal (satu layar). */
  fillHeight?: boolean;
  className?: string;
  /** Badge sudah/belum cetak PK — hanya relevan di antrean picking. */
  showPkPrintStatus?: boolean;
};

export function OutboundOrderQueue({
  title,
  subtitle,
  orders,
  selectedId,
  loading,
  emptyText,
  onSelect,
  timeMode = "active",
  batchIds,
  onToggleBatch,
  onRefresh,
  onPrintOrder,
  printSelectable = false,
  printSelectedIds,
  onTogglePrintSelect,
  onSelectAllPrint,
  onPrintSelected,
  fillHeight = false,
  className = "",
  showPkPrintStatus = true,
}: Props) {
  const { t, locale } = useLocale();
  const batchMode = Boolean(onToggleBatch);
  /** Picking: selalu SO. Validasi/siap ambil: INV bila sudah ada. */
  const preferSoRef = showPkPrintStatus;
  const pathname = usePathname();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [invoiceBySo, setInvoiceBySo] = useState<Record<string, string>>({});

  useEffect(() => {
    setNowMs(Date.now());
  }, [pathname]);

  useEffect(() => {
    if (timeMode !== "active") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [timeMode, pathname]);

  useEffect(() => {
    if (preferSoRef || orders.length === 0) {
      setInvoiceBySo({});
      return;
    }
    let cancelled = false;
    void fetchMissingInvoiceNos(orders).then((map) => {
      if (!cancelled) setInvoiceBySo(map);
    });
    return () => {
      cancelled = true;
    };
  }, [orders, preferSoRef]);

  return (
    <WmsCard
      className={
        (fillHeight ? "flex h-full min-h-0 flex-col " : "") + className
      }
    >
      <div className="flex items-start justify-between gap-2">
        <WmsSectionTitle title={title} subtitle={subtitle} />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title={t("wms.order.refresh")}
            className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
          >
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          </button>
        ) : null}
      </div>
      {printSelectable && orders.length > 0 ? (
        (() => {
          const allIds = orders.map((o) => o.id);
          const selCount = printSelectedIds?.length ?? 0;
          const allSelected = selCount > 0 && selCount >= allIds.length;
          return (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allSelected}
                  onChange={(e) => onSelectAllPrint?.(allIds, e.target.checked)}
                />
                {t("wms.order.selectAll")}
              </label>
              <button
                type="button"
                disabled={selCount === 0}
                onClick={() => onPrintSelected?.()}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                <Printer className="h-3.5 w-3.5" />
                {t("wms.order.printSelected", { count: selCount })}
              </button>
            </div>
          );
        })()
      ) : null}
      {loading ? (
        <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-indigo-600" />
      ) : orders.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul
          className={
            "mt-3 space-y-1 overflow-y-auto " +
            (fillHeight ? "min-h-0 flex-1" : "max-h-[28rem]")
          }
        >
          {orders.map((o) => {
            const meta = describeOrderForQueue(o, { nowMs, timeMode });
            const inBatch = batchIds?.includes(o.id);
            const hasPk = meta.pkNo !== "—";
            const pkPrinted = meta.pkPrinted || wasPkAutoPrinted(o.id);
            const waitLine = formatWmsStageWaitLineLocalized(t, locale, o, {
              nowMs,
              mode: timeMode,
            });
            const waitMin =
              timeMode === "active"
                ? getWmsStageWaitMinutes(getWmsStageSinceIso(o), nowMs)
                : null;
            const waitClass =
              timeMode === "active" ? wmsStageWaitToneClass(waitMin) : "text-slate-600";
            return (
              <li key={o.id}>
                <div
                  className={
                    "flex w-full gap-2 rounded-lg border px-2 py-2 text-left text-sm transition " +
                    (inBatch
                      ? "border-cyan-400 bg-cyan-50"
                      : selectedId === o.id
                        ? "border-indigo-300 bg-indigo-50"
                        : "border-slate-200")
                  }
                >
                  {batchMode ? (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={!!inBatch}
                      onChange={() => onToggleBatch?.(o)}
                      aria-label={`Pilih kelompok PK ${meta.pkNo}`}
                    />
                  ) : null}
                  {printSelectable ? (
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={!!printSelectedIds?.includes(o.id)}
                      onChange={() => onTogglePrintSelect?.(o)}
                      aria-label={`Pilih cetak PK ${meta.pkNo}`}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelect(o)}
                    className="min-w-0 flex-1 text-left hover:opacity-90"
                  >
                    {hasPk ? (
                      <div className="flex items-center gap-2">
                        <p className="flex items-baseline gap-1.5 font-mono text-xl font-bold tracking-wide text-indigo-700">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            PK
                          </span>
                          <span>{pkCodeBody(meta.pkNo)}</span>
                        </p>
                        {showPkPrintStatus ? (
                        <span
                          className={
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                            (pkPrinted
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-800")
                          }
                        >
                          {pkPrinted ? t("wms.order.pkPrinted") : t("wms.order.pkNotPrinted")}
                        </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="font-mono text-sm font-medium text-amber-800">{t("wms.order.pkNotCreatedQueue")}</p>
                    )}
                    <p className="text-[11px] text-slate-500">
                      {!preferSoRef && (meta.invoiceNo || invoiceBySo[o.id]) ? (
                        <>
                          INV:{" "}
                          <span className="font-mono">
                            {meta.invoiceNo || invoiceBySo[o.id]}
                          </span>
                        </>
                      ) : (
                        <>
                          SO: <span className="font-mono">{meta.orderNo}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-slate-600">{meta.storeName}</p>
                    {meta.deskRequestPending ? (
                      <p className="mt-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-950">
                        {t("wms.desk.queueBadge")}
                        {meta.deskRequesterName ? ` · ${meta.deskRequesterName}` : ""}
                      </p>
                    ) : null}
                    <p className={`mt-0.5 text-[10px] font-medium ${waitClass}`}>{waitLine}</p>
                    {timeMode === "active" ? (
                      <p className="mt-0.5 text-[10px] font-medium text-amber-800">
                        {getWmsStageLabel(t, meta.stage)}
                        {meta.pickupGate ? ` · ${getPickupGateLabel(t, meta.pickupGate)}` : ""}
                      </p>
                    ) : null}
                    {meta.pickupGate === "menunggu_awb" ? (
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-900">
                        {t("wms.order.uploadAwbToContinue")}
                      </p>
                    ) : null}
                  </button>
                  {onPrintOrder && hasPk ? (
                    <button
                      type="button"
                      onClick={() => onPrintOrder(o)}
                      title={pkPrinted ? t("wms.order.reprintPk") : t("wms.order.printPk")}
                      className={
                        "mt-0.5 h-8 w-8 shrink-0 rounded-lg border p-1.5 transition " +
                        (pkPrinted
                          ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          : "border-indigo-200 text-indigo-600 hover:bg-indigo-50")
                      }
                    >
                      <Printer className="h-full w-full" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && orders.length > 0 ? (
        <p className="mt-2 text-center text-xs text-slate-400">{t("wms.order.orderCount", { count: orders.length })}</p>
      ) : null}
    </WmsCard>
  );
}
