"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Scan, Loader2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";
import {
  WmsCard,
  WmsPrimaryButton,
  WmsSectionTitle,
  WmsBadge,
} from "@/components/wms/ui";
import { BISNIS_COLLECTIONS, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { fetchStockMapByWarehouse, getStockQtyFromMap } from "@/lib/wms/stock";
import { validateBarcodeScan, validatePickingQty } from "@/lib/wms/validations";
import { salesOrdersPickingPbFilter } from "@/lib/bisnis/client";
import { formatIntegerId } from "@/lib/format-number";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import {
  fetchProductPickHints,
  type ProductPickHint,
} from "@/lib/wms/product-placement-client";
import { formatPickHintLineLocalized } from "@/lib/i18n/wms-formatters";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  syncPickLinesFromUi,
  isPickComplete,
  filterSalesOrdersForPickingQueue,
  canCancelFromPicking,
  getOutboundStageFromSo,
} from "@/lib/wms/outbound-workflow";
import { mergeOutboundLinesFromSoExpanded } from "@/lib/wms/outbound-bundle-expand";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { WmsOrderHeader } from "@/components/wms/WmsOrderHeader";
import { PackageLabelActions } from "@/components/wms/PackageLabelActions";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { getPkFromSo, getPkIdentityView } from "@/lib/wms/pk-identity";
import {
  fetchRequiresSerialMap,
  isPickSerialsComplete,
  lineSerialsComplete,
} from "@/lib/wms/serial-numbers";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { findSalesOrderByScanRef } from "@/lib/wms/outbound-order-lookup";
import {
  getAutoPrintPkEnabled,
  setAutoPrintPkEnabled,
} from "@/lib/wms/picking-preferences";
import {
  autoPrintPkForOrder,
  autoPrintPkForOrders,
} from "@/lib/wms/auto-print-pk-queue";
import { wasPkAutoPrinted } from "@/lib/wms/pk-print-tracker";

type PickLine = {
  product: string;
  sku: string;
  name: string;
  qty: number;
  picked: number;
  pickHint?: ProductPickHint;
  requiresSerial: boolean;
  serials: string[];
  forBundleLabel?: string;
};

export default function WmsPickingPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);
  const [lines, setLines] = useState<PickLine[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [scanCode, setScanCode] = useState("");
  const [trackScan, setTrackScan] = useState("");
  const [entryMode, setEntryMode] = useState<"manual" | "tracking_scan">("manual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warehouseRoomCount, setWarehouseRoomCount] = useState<number | null>(null);
  const [pickWarehouseName, setPickWarehouseName] = useState<string>("");
  const [assigningPk, setAssigningPk] = useState(false);
  const [autoPrintPk, setAutoPrintPk] = useState(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const selectedSoRef = useRef<SalesOrder | null>(null);
  selectedSoRef.current = selectedSo;

  useEffect(() => {
    setAutoPrintPk(getAutoPrintPkEnabled());
  }, []);

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      let res;
      try {
        res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 50, {
          filter: salesOrdersPickingPbFilter(),
          sort: "-created",
          expand: "warehouse,customer",
          requestKey: null,
        });
      } catch {
        // fallback bila field WMS SO belum ditambahkan di schema PocketBase
        res = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getList<SalesOrder>(1, 50, {
          filter: 'status != "cancelled" && status != "delivered"',
          sort: "-created",
          expand: "warehouse,customer",
          requestKey: null,
        });
      }
      let queue = filterSalesOrdersForPickingQueue(res.items);
      const userId = pb.authStore.model?.id;
      const userName =
        typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined;
      if (userId && getAutoPrintPkEnabled()) {
        const { orders: printedQueue, updated } = await autoPrintPkForOrders(queue, {
          userId,
          userName,
          knownOrderIds: knownOrderIdsRef.current,
        });
        queue = printedQueue;
        if (updated.size > 0 && selectedSoRef.current) {
          const refreshed = updated.get(selectedSoRef.current.id);
          if (refreshed) setSelectedSo(refreshed);
        }
      }
      for (const o of queue) knownOrderIdsRef.current.add(o.id);
      setOrders(queue);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!autoPrintPk) return;
    const timer = window.setInterval(() => {
      void loadOrders({ silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoPrintPk, loadOrders]);

  const loadOrderLines = async (so: SalesOrder) => {
    setError("");
    setAssigningPk(false);
    let activeSo = so;
    const userId = pb.authStore.model?.id;
    if (userId && !getPkFromSo(so)) {
      setAssigningPk(true);
      try {
        activeSo = await updateSalesWarehouseProcess(so.id, userId, "start_picking", {
          userName:
            typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
        });
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setAssigningPk(false);
      }
    }
    setSelectedSo(activeSo);
    const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
      filter: `sales_order = "${activeSo.id}"`,
      expand: "product",
      requestKey: null,
    });
    const wfBase = parseOutboundWorkflow(activeSo.outbound_workflow_json);
    const wf = await mergeOutboundLinesFromSoExpanded(pb, wfBase, soLines);
    const wfJson = serializeOutboundWorkflow(wf);
    if (wfJson !== activeSo.outbound_workflow_json) {
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(activeSo.id, {
        outbound_workflow_json: wfJson,
      });
      activeSo = { ...activeSo, outbound_workflow_json: wfJson };
    }

    const pickEntries = Object.values(wf.pick?.lines ?? {});
    const productIds = pickEntries.map((l) => l.product_id).filter(Boolean);
    let hints: Record<string, ProductPickHint> = {};
    setWarehouseRoomCount(null);
    setPickWarehouseName(activeSo.expand?.warehouse?.name?.trim() ?? "");
    if (activeSo.warehouse && productIds.length > 0) {
      const placement = await fetchProductPickHints(activeSo.warehouse, productIds);
      hints = placement.hints;
      setWarehouseRoomCount(placement.roomCount);
      if (placement.warehouseName) {
        setPickWarehouseName(placement.warehouseName);
      }
      if (placement.error) {
        setError(placement.error);
      }
    }
    const requiresMap = await fetchRequiresSerialMap(productIds);
    setLines(
      pickEntries.map((pl) => ({
        product: pl.product_id,
        sku: pl.sku || "—",
        name: pl.name || pl.product_id,
        qty: pl.qty_required,
        picked: pl.qty_picked ?? 0,
        pickHint: hints[pl.product_id],
        requiresSerial: !!requiresMap[pl.product_id],
        serials: pl.serial_numbers ?? [],
        forBundleLabel: pl.for_bundle_label,
      })),
    );
    if (activeSo.warehouse) {
      const map = await fetchStockMapByWarehouse(activeSo.warehouse);
      setStockMap(map);
    } else {
      setStockMap({});
    }

    if (
      userId &&
      getAutoPrintPkEnabled() &&
      getPkFromSo(activeSo) &&
      !wasPkAutoPrinted(activeSo.id)
    ) {
      try {
        const printed = await autoPrintPkForOrder(activeSo, {
          userId,
          userName:
            typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
        });
        activeSo = printed;
        setSelectedSo(printed);
        setOrders((prev) => prev.map((o) => (o.id === printed.id ? printed : o)));
      } catch (e) {
        setError(getErrorMessage(e));
      }
    }
  };

  const cancelPickingOrder = async () => {
    if (!selectedSo) return;
    const reason = window.prompt(t("wms.picking.promptCancel"));
    if (reason === null) return;
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.picking.errRelogin"));
      await updateSalesWarehouseProcess(selectedSo.id, userId, "cancel_order", {
        note: reason,
        userName: typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
      });
      setSelectedSo(null);
      setLines([]);
      await loadOrders();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleScan = async () => {
    if (!selectedSo?.warehouse) {
      setError(t("wms.permintaan.errNoWarehouse"));
      return;
    }
    try {
      const product = await validateBarcodeScan(scanCode);
      const idx = lines.findIndex((l) => l.product === product.id);
      if (idx < 0) {
        setError(t("wms.validasi.errSkuNotInOrder", { sku: product.sku }));
        return;
      }
      const line = lines[idx];
      const nextPicked = line.picked + 1;
      await validatePickingQty(
        selectedSo.warehouse,
        line.product,
        line.name,
        nextPicked,
      );
      const nextLines = lines.map((l, i) => (i === idx ? { ...l, picked: nextPicked } : l));
      setLines(nextLines);
      await persistLines(nextLines);

      setScanCode("");
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const lineReady = (l: PickLine) => {
    if (l.picked < l.qty) return false;
    if (!l.requiresSerial) return true;
    return lineSerialsComplete(
      {
        product_id: l.product,
        qty_required: l.qty,
        qty_picked: l.picked,
        qty_validated: 0,
        serial_numbers: l.serials,
      },
      true,
    );
  };

  const doneCount = lines.filter(lineReady).length;
  const progress = lines.length ? Math.round((doneCount / lines.length) * 100) : 0;

  const updateSerial = (idx: number, serialIdx: number, value: string) => {
    setLines((prev) => {
      const next = prev.map((l, i) => {
        if (i !== idx) return l;
        const serials = [...l.serials];
        while (serials.length < l.qty) serials.push("");
        serials[serialIdx] = value;
        return { ...l, serials };
      });
      void persistLines(next);
      return next;
    });
  };

  const persistLines = async (nextLines: PickLine[]) => {
    if (!selectedSo) return;
    const wf = syncPickLinesFromUi(
      parseOutboundWorkflow(selectedSo.outbound_workflow_json),
      nextLines.map((l) => ({
        product: l.product,
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        picked: l.picked,
        serial_numbers: l.serials,
      })),
    );
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(selectedSo.id, {
      outbound_workflow_json: serializeOutboundWorkflow(wf),
    });
    setSelectedSo({ ...selectedSo, outbound_workflow_json: serializeOutboundWorkflow(wf) });
  };

  const loadSoByTracking = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    try {
      const match = await findSalesOrderByScanRef(c);
      if (!match) throw new Error(t("wms.picking.errSoNotFound"));
      setEntryMode("tracking_scan");
      await loadOrderLines(match);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const completePicking = async () => {
    if (!selectedSo) return;
    const wf = syncPickLinesFromUi(parseOutboundWorkflow(selectedSo.outbound_workflow_json), lines);
    if (!isPickComplete(wf)) {
      setError(t("wms.permintaan.errPickingIncomplete"));
      return;
    }
    const requiresMap = Object.fromEntries(lines.map((l) => [l.product, l.requiresSerial]));
    const wfForSn = syncPickLinesFromUi(wf, lines);
    if (!isPickSerialsComplete(wfForSn, requiresMap)) {
      setError(t("wms.picking.errSerialIncomplete"));
      return;
    }
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.picking.errRelogin"));
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(selectedSo.id, {
        outbound_workflow_json: serializeOutboundWorkflow(wf),
      });
      const updated = await updateSalesWarehouseProcess(selectedSo.id, userId, "complete_pick", {
        entryMode,
        userName: pb.authStore.model?.name as string | undefined,
      });
      const finishedSoId = selectedSo.id;
      const pkDone = getPkIdentityView(updated);
      setSelectedSo(null);
      setLines([]);
      setScanCode("");
      try {
        const acts = await pb.collection(INV_COLLECTIONS.staffActivities).getFullList({
          filter: `entity_type = "biz_sales_orders" && entity_id = "${finishedSoId}" && activity_type = "wms.pick_task"`,
          requestKey: null,
        });
        for (const a of acts) {
          const row = a as { id: string; payload?: Record<string, unknown> };
          await pb.collection(INV_COLLECTIONS.staffActivities).update(row.id, {
            payload: { ...(row.payload || {}), status: "done" },
          });
        }
      } catch {
        /* audit task opsional — jangan blokir alur validasi */
      }
      setError("");
      await loadOrders();
      alert(t("wms.picking.completeAlert", { pk: pkDone.pkNo }));
      router.push(PERMINTAAN_BARANG.validasi);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <>
        <OutboundFlowBar stage={selectedSo ? getOutboundStageFromSo(selectedSo) : "new_order"} />

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <WmsCard>
              <WmsSectionTitle title={t("wms.picking.modeTitle")} subtitle={t("wms.picking.modeSubtitle")} />
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t("wms.picking.autoPrintPk")}</p>
                  <p className="text-[10px] text-slate-500">
                    {autoPrintPk ? t("wms.picking.autoPrintOn") : t("wms.picking.autoPrintOff")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoPrintPk}
                  onClick={() => {
                    const next = !autoPrintPk;
                    setAutoPrintPk(next);
                    setAutoPrintPkEnabled(next);
                    if (next) void loadOrders({ silent: true });
                  }}
                  className={
                    "relative h-7 w-12 shrink-0 rounded-full transition " +
                    (autoPrintPk ? "bg-indigo-600" : "bg-slate-300")
                  }
                >
                  <span
                    className={
                      "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition " +
                      (autoPrintPk ? "left-5" : "left-0.5")
                    }
                  />
                </button>
              </label>
              <div className="mt-2 flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setEntryMode("manual")}
                  className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "manual" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
                >
                  {t("wms.picking.manualMode")}
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("tracking_scan")}
                  className={`rounded-lg px-3 py-1.5 font-medium ${entryMode === "tracking_scan" ? "bg-indigo-600 text-white" : "bg-slate-100"}`}
                >
                  {t("wms.picking.scanMode")}
                </button>
              </div>
              {entryMode === "tracking_scan" && (
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                    placeholder={t("wms.picking.scanPkOrderPlaceholder")}
                    value={trackScan}
                    onChange={(e) => setTrackScan(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void loadSoByTracking(trackScan)}
                  />
                  <WmsPrimaryButton type="button" onClick={() => void loadSoByTracking(trackScan)}>
                    {t("wms.picking.findSo")}
                  </WmsPrimaryButton>
                </div>
              )}
            </WmsCard>

            <OutboundOrderQueue
              title={t("wms.picking.pkQueueTitle")}
              subtitle={t("wms.picking.pkQueueSubtitle")}
              orders={orders}
              selectedId={selectedSo?.id}
              loading={loading}
              emptyText={t("wms.picking.queueEmpty")}
              onSelect={(o) => void loadOrderLines(o)}
            />
          </div>

          <div className="space-y-4 lg:col-span-2">
            {selectedSo ? (
              <>
                <WmsOrderHeader so={selectedSo} />
                <PackageLabelActions
                  so={selectedSo}
                  assigning={assigningPk}
                  autoPrintEnabled={autoPrintPk}
                />

                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                  <p className="font-semibold">{t("wms.picking.outboundTitle")}</p>
                  <p className="mt-1">
                    {t("wms.picking.outboundHint", {
                      warehouse: selectedSo.expand?.warehouse?.name || "—",
                    })}
                  </p>
                </div>

                <WmsCard>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <WmsSectionTitle
                      title={(() => {
                        const pk = getPkIdentityView(selectedSo);
                        return pk.pkNo !== "—"
                          ? t("wms.picking.pkTitle", { pk: pk.pkNo })
                          : t("wms.picking.pkNotCreated");
                      })()}
                      subtitle={t("wms.picking.soSubtitle", {
                        order: selectedSo.order_no,
                        warehouse: selectedSo.expand?.warehouse?.name || "—",
                      })}
                    />
                    <WmsBadge tone={progress === 100 ? "emerald" : "indigo"}>{progress}%</WmsBadge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                      placeholder={t("wms.picking.scanPlaceholder")}
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleScan()}
                    />
                    <WmsPrimaryButton type="button" onClick={() => void handleScan()}>
                      <Scan className="mr-1 inline h-4 w-4" /> {t("wms.picking.scanBtn")}
                    </WmsPrimaryButton>
                  </div>
                </WmsCard>

                <WmsCard>
                  <WmsSectionTitle
                    title={t("wms.picking.checklistTitle")}
                    subtitle={t("wms.picking.checklistSubtitle", { done: doneCount, total: lines.length })}
                  />
                  <ul className="mt-4 space-y-2">
                    {lines.map((l, i) => (
                      <li
                        key={l.product}
                        className={
                          "flex items-center gap-3 rounded-xl border px-4 py-3 " +
                          (l.picked >= l.qty ? "border-emerald-200 bg-emerald-50/80" : "border-slate-200")
                        }
                      >
                        <span className="font-mono text-xs text-indigo-600">{l.sku}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{l.name}</p>
                          {l.forBundleLabel ? (
                            <p className="text-[11px] font-medium text-amber-800">
                              {t("wms.picking.bundleFor", { label: l.forBundleLabel })}
                            </p>
                          ) : null}
                          {(() => {
                            const hintLine = formatPickHintLineLocalized(t, l.pickHint, {
                              warehouseName: pickWarehouseName || selectedSo.expand?.warehouse?.name,
                            });
                            return hintLine ? (
                              <p className="text-xs font-medium text-violet-800">{hintLine}</p>
                            ) : null;
                          })()}
                          <p className="text-xs text-slate-500">
                            {t("wms.picking.stockInWarehouse", {
                              qty: formatIntegerId(getStockQtyFromMap(stockMap, l.product)),
                            })}
                          </p>
                          {l.requiresSerial ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] font-semibold uppercase text-amber-800">
                                {t("wms.picking.serialRequired")}
                              </p>
                              {Array.from({ length: l.qty }, (_, si) => (
                                <input
                                  key={`${l.product}-sn-${si}`}
                                  className="w-full rounded border border-amber-200 px-2 py-1 font-mono text-xs"
                                  placeholder={t("wms.picking.serialPlaceholder", { n: si + 1 })}
                                  value={l.serials[si] ?? ""}
                                  onChange={(e) => updateSerial(i, si, e.target.value)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <span className="text-sm font-semibold">
                          {l.picked}/{l.qty}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(() => {
                    const pk = getPkIdentityView(selectedSo);
                    if (pk.pkNo === "—") return null;
                    return (
                      <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 font-mono text-sm text-violet-900">
                        {t("wms.picking.pkScanHint", { pk: pk.pkNo })}
                      </p>
                    );
                  })()}
                  {progress === 100 && lines.length > 0 ? (
                    <div className="mt-4">
                    <WmsPrimaryButton type="button" onClick={() => void completePicking()}>
                      {t("wms.picking.completeBtn")}
                    </WmsPrimaryButton>
                    </div>
                  ) : null}
                  {canCancelFromPicking(getOutboundStageFromSo(selectedSo)) ? (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                      onClick={() => void cancelPickingOrder()}
                    >
                      {t("wms.picking.cancelOrder")}
                    </button>
                  ) : null}
                </WmsCard>
              </>
            ) : (
              <WmsCard className="py-12 text-center text-sm text-slate-500">
                {t("wms.picking.selectOrder")}
              </WmsCard>
            )}
          </div>
        </div>

    </>
  );
}
