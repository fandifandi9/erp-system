"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Scan, Truck, CheckCircle2, Printer, PackageCheck, Layers } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { loadPickupQueue, isSoAwaitingPickup } from "@/lib/wms/outbound-queues";
import {
  getOutboundStageFromSo,
  parseOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { WmsOrderHeader } from "@/components/wms/WmsOrderHeader";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import {
  isPhysicalHandoverReady,
  matchHandoverScanToOrder,
  type PhysicalCheckState,
} from "@/lib/wms/pickup-handover";
import { findSalesOrderByScanRef } from "@/lib/wms/outbound-order-lookup";
import {
  buildSharedPickupPayload,
  createPickupBatchId,
  isPickupBatchReady,
  recordPickupBatchScan,
  type PickupBatchItem,
} from "@/lib/wms/pickup-batch";
import { normalizeHandoverScanCode } from "@/lib/wms/pickup-handover";
import { AwbLabelPanel } from "@/components/bisnis/AwbLabelPanel";
import { AwbLabelPrintActions } from "@/components/wms/AwbLabelPrintActions";
import {
  pickupGateBlocksHandover,
  PICKUP_GATE_UI,
} from "@/lib/wms/awb-pickup-gate";

async function uploadPhotos(soId: string, warehouse: string, files: File[], uploadErr: string) {
  if (!files.length) return [] as string[];
  const fd = new FormData();
  fd.set("entity_type", "biz_sales_orders");
  fd.set("entity_id", soId);
  fd.set("warehouse", warehouse);
  fd.set("purpose", "pickup");
  for (const file of files) {
    fd.append("files", file);
  }
  const res = await fetch("/api/wms/photos", { method: "POST", body: fd, credentials: "include" });
  const json = (await res.json()) as { ok?: boolean; file_ids?: string[]; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? uploadErr);
  return json.file_ids ?? [];
}

const emptyChecks = (): PhysicalCheckState => ({
  package_count_ok: false,
  label_readable: false,
  seal_intact: false,
});

export default function WmsPickupPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [queue, setQueue] = useState<SalesOrder[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [handoverMode, setHandoverMode] = useState<"batch" | "single">("batch");
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [batch, setBatch] = useState<PickupBatchItem[]>([]);
  const [batchScan, setBatchScan] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [courierCompany, setCourierCompany] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [physicalScan, setPhysicalScan] = useState("");
  const [scanMatched, setScanMatched] = useState(false);
  const [physicalChecks, setPhysicalChecks] = useState<PhysicalCheckState>(emptyChecks());

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      setQueue(await loadPickupQueue());
    } catch (e) {
      setError(getErrorMessage(e));
      setQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  const batchIds = batch.map((b) => b.so.id);
  const batchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (handoverMode === "batch" && !loading && !saving) {
      batchInputRef.current?.focus();
    }
  }, [handoverMode, loading, saving, batch.length]);

  const openOrder = useCallback((row: SalesOrder) => {
    if (!isSoAwaitingPickup(row)) {
      setError(t("wms.permintaan.errNotReadyPickup"));
      return;
    }
    setSo(row);
    const { shipping } = parseNotesWithShipping(row.notes ?? "");
    setCourierCompany(shipping.courier?.trim() ?? "");
    setPhysicalScan("");
    setScanMatched(false);
    setPhysicalChecks(emptyChecks());
    setError("");
    setInfo("");
  }, [t]);

  const verifyPhysicalScan = () => {
    if (!so) return;
    const scanned = normalizeHandoverScanCode(physicalScan);
    if (!scanned) {
      setError(t("wms.pickup.errScanAwb"));
      return;
    }
    setScanMatched(true);
    setError("");
    if (!matchHandoverScanToOrder(so, scanned)) {
      setInfo(t("wms.pickup.awbRecordedCheck", { awb: scanned }));
    } else {
      setInfo(t("wms.pickup.awbRecorded", { awb: scanned }));
    }
  };

  const physicalReady = so
    ? isPhysicalHandoverReady(physicalChecks, scanMatched)
    : false;

  const loadSo = useCallback(
    async (code: string) => {
      setLoading(true);
      setError("");
      try {
        const row = await findSalesOrderByScanRef(code);
        if (!row) throw new Error(t("wms.pickup.errOrderNotFound"));
        openOrder(row);
      } catch (e) {
        setSo(null);
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [openOrder, t],
  );

  const addBatchByScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const { items, message } = await recordPickupBatchScan(trimmed, batch, t);
      setBatch(items);
      setBatchScan("");
      setInfo(message);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const reloadSo = useCallback(async (soId: string) => {
    const row = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId);
    setSo(row);
    await refreshQueue();
  }, [refreshQueue]);

  const completePickup = async () => {
    if (!so) return;
    if (pickupGateBlocksHandover(so)) {
      setError(t("wms.pickup.errAwaitingAwb"));
      return;
    }
    if (!driverName.trim()) {
      setError(t("wms.permintaan.errCourierRequired"));
      return;
    }
    if (!physicalReady) {
      setError(t("wms.pickup.errVerifyIncomplete"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.pickup.errRelogin"));
      const photoIds = photo
        ? await uploadPhotos(so.id, so.warehouse, [photo], t("wms.pickup.errUploadPhoto"))
        : [];
      await updateSalesWarehouseProcess(so.id, userId, "complete_pickup", {
        userName: pb.authStore.model?.name as string | undefined,
        pickup: buildSharedPickupPayload({
          mode: "scan_label",
          userId,
          userName: typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          courierCompany: courierCompany.trim() || undefined,
          photoIds,
          physicalChecks,
          batchId: createPickupBatchId(),
          batchSize: 1,
          scannedAwb: normalizeHandoverScanCode(physicalScan),
        }),
      });
      setSo(null);
      setDriverName("");
      setDriverPhone("");
      setPhoto(null);
      setScanCode("");
      setPhysicalChecks(emptyChecks());
      await refreshQueue();
      router.push(PERMINTAAN_BARANG.selesai);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const completeBatchPickup = async () => {
    if (batch.length === 0) {
      setError(t("wms.pickup.errMinBatch"));
      return;
    }
    const blocked = batch.find((b) => pickupGateBlocksHandover(b.so));
    if (blocked) {
      setError(t("wms.pickup.errBatchOrderAwaitingAwb", { order: blocked.so.order_no }));
      return;
    }
    if (!driverName.trim()) {
      setError(t("wms.permintaan.errCourierRequired"));
      return;
    }
    if (!isPickupBatchReady(batch)) {
      setError(t("wms.pickup.errMinAwbScan"));
      return;
    }
    if (!isPhysicalHandoverReady(physicalChecks, true)) {
      setError(t("wms.pickup.errChecklistIncomplete"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.pickup.errRelogin"));
      const batchId = createPickupBatchId();
      const userName =
        typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined;
      let photoIds: string[] = [];
      if (photo && batch[0]) {
        photoIds = await uploadPhotos(
          batch[0].so.id,
          batch[0].so.warehouse,
          [photo],
          t("wms.pickup.errUploadPhoto"),
        );
      }

      const recordedAwbs = batch.map((b) => b.scannedAwb);
      for (const item of batch) {
        await updateSalesWarehouseProcess(item.so.id, userId, "complete_pickup", {
          userName,
          pickup: buildSharedPickupPayload({
            mode: "scan_label",
            userId,
            userName,
            driverName: driverName.trim(),
            driverPhone: driverPhone.trim(),
            courierCompany: courierCompany.trim() || undefined,
            photoIds,
            physicalChecks,
            batchId,
            batchSize: batch.length,
            scannedAwb: item.scannedAwb,
            recordedAwbs,
          }),
        });
      }

      setBatch([]);
      setDriverName("");
      setDriverPhone("");
      setPhoto(null);
      setPhysicalChecks(emptyChecks());
      await refreshQueue();
      router.push(PERMINTAAN_BARANG.selesai);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const cancelShipment = async () => {
    if (!so) return;
    if (!window.confirm(t("wms.permintaan.confirmCancelHandover"))) return;
    setSaving(true);
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.pickup.errRelogin"));
      await updateSalesWarehouseProcess(so.id, userId, "cancel_shipment", {
        note: t("wms.pickup.cancelNote"),
      });
      setSo(null);
      await refreshQueue();
      router.push(PERMINTAAN_BARANG.validasi);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const stage = so ? getOutboundStageFromSo(so) : "ready_pickup";
  const awaitingAwb = so ? pickupGateBlocksHandover(so) : false;
  const pickupGateCls = awaitingAwb ? PICKUP_GATE_UI.menunggu_awb.cls : PICKUP_GATE_UI.siap_serah.cls;

  const driverFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        {t("wms.pickup.driverName")} <span className="text-red-500">*</span>
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder={t("wms.pickup.driverNamePlaceholder")}
        />
      </label>
      <label className="block text-sm">
        {t("wms.pickup.driverPhone")}
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          value={driverPhone}
          onChange={(e) => setDriverPhone(e.target.value)}
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        {t("wms.pickup.courierCompany")}
        <input
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          value={courierCompany}
          onChange={(e) => setCourierCompany(e.target.value)}
          placeholder={t("wms.pickup.courierPlaceholder")}
        />
      </label>
    </div>
  );

  const physicalChecklist = (
    <ul className="mt-3 space-y-2 text-sm">
      {(
        [
          ["package_count_ok", t("wms.pickup.checkPackageCount")],
          ["label_readable", t("wms.pickup.checkLabelReadable")],
          ["seal_intact", t("wms.pickup.checkSealIntact")],
        ] as const
      ).map(([key, label]) => (
        <li key={key}>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={physicalChecks[key]}
              onChange={(e) =>
                setPhysicalChecks((c) => ({ ...c, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        </li>
      ))}
    </ul>
  );

  return (
    <>
        <OutboundFlowBar stage={stage} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setHandoverMode("batch");
              setSo(null);
              setError("");
            }}
            className={
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium " +
              (handoverMode === "batch" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700")
            }
          >
            <Layers className="h-4 w-4" />
            {t("wms.pickup.modeBatch")}
          </button>
          <button
            type="button"
            onClick={() => {
              setHandoverMode("single");
              setBatch([]);
              setError("");
            }}
            className={
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium " +
              (handoverMode === "single" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700")
            }
          >
            {t("wms.pickup.modeSingle")}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {info}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <OutboundOrderQueue
              title={t("wms.pickup.queueTitle")}
              subtitle={
                handoverMode === "batch"
                  ? t("wms.pickup.queueSubtitleBatch")
                  : t("wms.pickup.queueSubtitleSingle")
              }
              orders={queue}
              selectedId={handoverMode === "single" ? so?.id : undefined}
              batchIds={handoverMode === "batch" ? batchIds : undefined}
              loading={queueLoading}
              emptyText={t("wms.pickup.queueEmpty")}
              onSelect={(o) => {
                if (handoverMode === "single") openOrder(o);
              }}
            />
          </div>

          <div className="space-y-4 lg:col-span-2">
            {handoverMode === "batch" ? (
              <WmsCard className="border-cyan-200">
                <WmsSectionTitle
                  title={t("wms.pickup.batchTitle")}
                  subtitle={t("wms.pickup.batchSubtitle", { count: batch.length })}
                />
                {driverFields}

                <div className="mt-4 rounded-xl border-2 border-cyan-300 bg-cyan-50/80 p-4">
                  <p className="text-sm font-bold text-cyan-950">{t("wms.pickup.scanAwbMain")}</p>
                  <p className="mt-1 text-xs text-cyan-900">{t("wms.pickup.scanAwbHint")}</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={batchInputRef}
                      className="flex-1 rounded-lg border-2 border-cyan-400 bg-white px-3 py-3 font-mono text-base"
                      placeholder={t("wms.pickup.scanAwbPlaceholder")}
                      value={batchScan}
                      onChange={(e) => setBatchScan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addBatchByScan(batchScan);
                        }
                      }}
                      autoFocus
                    />
                    <WmsPrimaryButton
                      type="button"
                      disabled={loading}
                      onClick={() => void addBatchByScan(batchScan)}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Scan className="h-4 w-4" />
                      )}
                    </WmsPrimaryButton>
                  </div>
                </div>

                {batch.length > 0 ? (
                  <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <th className="px-3 py-2">{t("wms.pickup.colAwb")}</th>
                          <th className="px-3 py-2">{t("wms.pickup.colOrder")}</th>
                          <th className="px-3 py-2">{t("wms.pickup.colTime")}</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {batch.map((item) => (
                          <tr key={item.so.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-mono text-sm font-bold text-indigo-900">
                              {item.scannedAwb}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-600">
                              {item.orderNo}
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {new Date(item.recordedAt).toLocaleTimeString(locale === "en" ? "en-US" : "id-ID")}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="text-xs text-red-600 hover:underline"
                                onClick={() =>
                                  setBatch((prev) => prev.filter((b) => b.so.id !== item.so.id))
                                }
                              >
                                {t("wms.pickup.remove")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">{t("wms.pickup.batchEmpty")}</p>
                )}

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <PackageCheck className="h-4 w-4" />
                    {t("wms.pickup.checklistBatch")}
                  </p>
                  {physicalChecklist}
                </div>

                <label className="mt-3 block text-sm">
                  {t("wms.pickup.photoBatch")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <WmsPrimaryButton
                    disabled={saving || batch.length === 0}
                    onClick={() => void completeBatchPickup()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="mr-2 inline h-4 w-4" />
                    )}
                    {t("wms.pickup.completeBatch", { count: batch.length })}
                  </WmsPrimaryButton>
                  {batch.length > 0 ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                      onClick={() => setBatch([])}
                    >
                      {t("wms.pickup.clearBatch")}
                    </button>
                  ) : null}
                </div>
              </WmsCard>
            ) : !so ? (
              <WmsCard>
                <WmsSectionTitle title={t("wms.pickup.singleTitle")} />
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm"
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void loadSo(scanCode)}
                    placeholder={t("wms.pickup.singlePlaceholder")}
                  />
                  <WmsPrimaryButton type="button" disabled={loading} onClick={() => void loadSo(scanCode)}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                  </WmsPrimaryButton>
                </div>
                <p className="mt-3 text-sm text-slate-500">{t("wms.pickup.singleHint")}</p>
              </WmsCard>
            ) : (
              <WmsCard>
                <WmsOrderHeader so={so} />
                {(() => {
                  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
                  const validator = wf.validate_pack?.user_name ?? wf.validate_pack?.user_id;
                  const validatedAt = wf.validate_pack?.completed_at ?? wf.validate_pack?.at;
                  return (
                    <dl className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                      <div>
                        <span className="text-slate-400">{t("wms.pickup.labelValidator")}</span> {validator ?? "—"}
                      </div>
                      <div>
                        <span className="text-slate-400">{t("wms.pickup.labelValidatedAt")}</span>{" "}
                        {validatedAt
                          ? new Date(validatedAt).toLocaleString(locale === "en" ? "en-US" : "id-ID")
                          : "—"}
                      </div>
                    </dl>
                  );
                })()}
                <div className="mt-4 space-y-3">
                  <AwbLabelPrintActions so={so} />
                  {awaitingAwb ? (
                    <div className={`rounded-lg px-3 py-2 text-sm ${pickupGateCls}`}>
                      <p className="font-semibold">{t("wms.pickup.gateAwaitingAwb")}</p>
                      <p className="text-xs">{t("wms.pickup.uploadAwbHint")}</p>
                    </div>
                  ) : null}
                  <AwbLabelPanel
                    salesOrderId={so.id}
                    uploadSource="wms_pickup"
                    compact
                    onUploaded={() => void reloadSo(so.id)}
                  />
                </div>
                {driverFields}
                <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-cyan-950">
                    <PackageCheck className="h-4 w-4" />
                    {t("wms.pickup.verifyPhysical")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-cyan-200 bg-white px-3 py-2 font-mono text-sm"
                      placeholder={t("wms.pickup.scanAwbLabelPlaceholder")}
                      value={physicalScan}
                      onChange={(e) => {
                        setPhysicalScan(e.target.value);
                        setScanMatched(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && verifyPhysicalScan()}
                    />
                    <WmsPrimaryButton type="button" onClick={() => verifyPhysicalScan()}>
                      <Scan className="h-4 w-4" />
                    </WmsPrimaryButton>
                  </div>
                  {scanMatched ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">{t("wms.pickup.scanMatched")}</p>
                  ) : (
                    <p className="mt-2 text-xs text-cyan-800">{t("wms.pickup.scanMismatchHint")}</p>
                  )}
                  {physicalChecklist}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                  <Link
                    href={`/wms/pickup/tanda-terima/${so.id}?print=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
                  >
                    <Printer className="h-4 w-4" />
                    {t("wms.pickup.printReceipt")}
                  </Link>
                </div>
                <label className="mt-3 block text-sm">
                  {t("wms.pickup.photoOptional")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="mt-1 block w-full text-sm"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                <div className="mt-4">
                  <WmsPrimaryButton
                    disabled={saving || !physicalReady}
                    onClick={() => void completePickup()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="mr-2 inline h-4 w-4" />
                    )}
                    {t("wms.pickup.completeSingle")}
                  </WmsPrimaryButton>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  className="mt-3 w-full rounded-lg border border-amber-300 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50"
                  onClick={() => void cancelShipment()}
                >
                  {t("wms.pickup.cancelShipment")}
                </button>
              </WmsCard>
            )}
          </div>
        </div>

    </>
  );
}
