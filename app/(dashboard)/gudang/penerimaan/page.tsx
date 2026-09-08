"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, PackageOpen, ChevronRight } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsBadge, WmsCard, WmsFlowBar, WmsSectionTitle } from "@/components/wms/ui";
import { WMS_FLOW_STEPS } from "@/lib/wms/navigation";
import { fetchInboundQueue } from "@/lib/wms/inbound-queue-client";
import {
  getWarehouseProcessStatus,
  WAREHOUSE_PROCESS_STATUS_UI,
} from "@/lib/bisnis/client";
import { returDisplayNo, returHasPlatformNo } from "@/lib/bisnis/retur-display";
import type { PurchaseOrder, Retur, WarehouseProcessStatus } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

const WH_BADGE_TONE: Record<
  WarehouseProcessStatus,
  "slate" | "emerald" | "amber" | "indigo" | "violet"
> = {
  pending: "slate",
  checking: "indigo",
  hold: "amber",
  processing: "violet",
  complete: "emerald",
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function GudangPenerimaanPage() {
  const { t } = useLocale();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [salesReturns, setSalesReturns] = useState<Retur[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<Retur[]>([]);
  const [heldSalesReturns, setHeldSalesReturns] = useState<Retur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchInboundQueue();
      setOrders(data.orders);
      setSalesReturns(data.salesReturns);
      setPurchaseReturns(data.purchaseReturns);
      setHeldSalesReturns(data.heldSalesReturns ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, t("wms.penerimaan.errLoad")));
      setOrders([]);
      setSalesReturns([]);
      setPurchaseReturns([]);
      setHeldSalesReturns([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = orders.filter((o) => getWarehouseProcessStatus(o) === "pending").length;
  const hold =
    orders.filter((o) => getWarehouseProcessStatus(o) === "hold").length + heldSalesReturns.length;
  const returnQueueTotal = salesReturns.length + purchaseReturns.length;

  return (
    <InventoryGate>
      <InventoryShell
        title={t("wms.penerimaan.title")}
        subtitle={t("wms.penerimaan.subtitle")}
        module="wms"
      >
        <WmsCard padding="p-4">
          <WmsFlowBar steps={WMS_FLOW_STEPS} activeIndex={1} />
        </WmsCard>

        <div className="grid gap-4 sm:grid-cols-4">
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("wms.penerimaan.queue")}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{orders.length + returnQueueTotal}</p>
          </WmsCard>
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("wms.penerimaan.returnQueue")}</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{returnQueueTotal}</p>
          </WmsCard>
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("wms.penerimaan.pending")}</p>
            <p className="mt-1 text-2xl font-bold text-slate-700">{pending}</p>
          </WmsCard>
          <WmsCard padding="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("wms.penerimaan.hold")}</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{hold}</p>
          </WmsCard>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <p className="mt-2 text-xs text-red-700">{t("wms.penerimaan.errSchemaHint")}</p>
          </div>
        ) : null}

        <WmsCard>
          <WmsSectionTitle
            title={t("wms.penerimaan.salesReturn")}
            subtitle={t("wms.penerimaan.salesReturnSubtitle")}
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : salesReturns.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("wms.penerimaan.emptyReturn")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {salesReturns.map((r) => {
                const displayNo = returDisplayNo(r);
                const hasPlatform = returHasPlatformNo(r);
                const viaCourier = r.return_method === "courier";
                const courierName = r.return_courier?.trim() || "";
                const trackingNo = r.return_tracking_no?.trim() || "";
                return (
                  <li key={r.id}>
                    <Link
                      href={`/gudang/penerimaan/retur/${r.id}`}
                      className="flex flex-wrap items-center gap-3 px-1 py-4 transition hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-semibold text-amber-800">{displayNo}</p>
                        {hasPlatform ? (
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                            Sistem: {r.retur_no}
                          </p>
                        ) : null}
                        {viaCourier || courierName || trackingNo ? (
                          <p className="mt-1 text-xs text-slate-600">
                            <span className="font-medium text-slate-700">
                              {courierName || t("wms.penerimaan.returnCourierFallback")}
                            </span>
                            {trackingNo ? (
                              <>
                                <span className="text-slate-400"> · </span>
                                <span className="font-mono font-semibold text-indigo-700">
                                  {trackingNo}
                                </span>
                              </>
                            ) : null}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-500">
                            {t("wms.penerimaan.returnDropoffHint")}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WmsCard>

        <WmsCard>
          <WmsSectionTitle
            title="Hold retur penjualan"
            subtitle="WMS sudah terima fisik & bantah claim — stok di gudang sementara. Retur belum ditutup. Putusan final hanya di modul Retur bisnis (Ubah / Setuju / Kirim kembali). Klik baris untuk lihat bukti WMS."
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : heldSalesReturns.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Tidak ada retur hold.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {heldSalesReturns.map((r) => {
                const displayNo = returDisplayNo(r);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/gudang/penerimaan/retur/${r.id}`}
                      className="flex flex-wrap items-center gap-3 px-1 py-4 transition hover:bg-amber-50/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm font-semibold text-amber-900">{displayNo}</p>
                          <WmsBadge tone="amber">Hold</WmsBadge>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {r.expand?.customer?.name ?? "—"} · menunggu putusan bisnis
                        </p>
                        {r.wms_dispute_note ? (
                          <p className="mt-1 line-clamp-2 text-xs text-amber-900/80">
                            {r.wms_dispute_note}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] font-medium text-amber-800/90">
                          Retur belum ditutup — hanya lihat bukti; putusan final di bisnis
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-amber-700/50" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WmsCard>

        <WmsCard>
          <WmsSectionTitle
            title={t("wms.penerimaan.purchaseReturn")}
            subtitle={t("wms.penerimaan.purchaseReturnSubtitle")}
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : purchaseReturns.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{t("wms.penerimaan.emptyPurchaseReturn")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {purchaseReturns.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/gudang/penerimaan/retur/${r.id}`}
                    className="flex flex-wrap items-center gap-3 px-1 py-4 transition hover:bg-slate-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm font-semibold text-blue-700">{r.retur_no}</span>
                      <p className="mt-1 text-sm text-slate-700">
                        {r.expand?.supplier?.name ?? t("wms.penerimaan.supplier")} ·{" "}
                        {t("wms.penerimaan.warehouse", { name: r.expand?.warehouse?.name ?? "—" })}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WmsCard>

        <WmsCard>
          <WmsSectionTitle
            title={t("wms.penerimaan.poQueue")}
            subtitle={t("wms.penerimaan.poQueueSubtitle")}
          />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <PackageOpen className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">{t("wms.penerimaan.emptyPo")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("wms.penerimaan.poEmptyHint")}</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {orders.map((po) => {
                const whStatus = getWarehouseProcessStatus(po)!;
                const st = WAREHOUSE_PROCESS_STATUS_UI[whStatus];
                const orderer =
                  po.expand?.created_by?.name || po.expand?.created_by?.email || "—";
                return (
                  <li key={po.id}>
                    <Link
                      href={`/gudang/penerimaan/${po.id}`}
                      className="flex flex-wrap items-center gap-3 px-1 py-4 transition hover:bg-slate-50/80"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-indigo-700">
                            {po.po_no}
                          </span>
                          <WmsBadge tone={WH_BADGE_TONE[whStatus]}>{t(st.labelKey)}</WmsBadge>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {po.expand?.supplier?.name ?? t("wms.penerimaan.supplier")}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t("wms.penerimaan.orderedBy", { name: orderer })} ·{" "}
                          {t("wms.penerimaan.warehouse", { name: po.expand?.warehouse?.name ?? "—" })} ·{" "}
                          {fmtDate(po.send_to_warehouse_at)}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
