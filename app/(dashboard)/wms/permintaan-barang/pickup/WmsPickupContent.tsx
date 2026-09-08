"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Scan, Truck, Layers, RotateCcw } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle, WmsBadge } from "@/components/wms/ui";
import type { SalesOrder } from "@/lib/bisnis/types";
import { returDisplayNo } from "@/lib/bisnis/retur-display";
import { loadPickupQueue, describeOrderForQueue } from "@/lib/wms/outbound-queues";
import { fetchMissingInvoiceNos } from "@/lib/wms/enrich-queue-invoices";
import {
  loadResendPickupQueue,
  salesReturnResendScanMatches,
  type ResendPickupQueueItem,
} from "@/lib/wms/sales-return-resend";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { autoPhysicalChecks } from "@/lib/wms/pickup-handover";
import {
  buildSharedPickupPayload,
  buildTtLineFromSo,
  createPickupBatchId,
  isPickupBatchReady,
  recordPickupBatchScan,
  type PickupBatchItem,
} from "@/lib/wms/pickup-batch";
import { ValidatePackPhotoCapture } from "@/components/wms/ValidatePackPhotoCapture";
import { WmsPickupDeskKiosk } from "@/components/wms/WmsPickupDeskKiosk";
import { WMS_PICKUP_PHOTO_MAX } from "@/lib/wms/wms-media-limits";
import { pickupGateBlocksHandover } from "@/lib/wms/awb-pickup-gate";
import { allocateTtNo } from "@/lib/wms/tt-number";
import { pkCodeBody } from "@/lib/wms/pk-number";

async function uploadPhotos(
  entityType: "biz_sales_orders" | "biz_returs",
  entityId: string,
  warehouse: string,
  files: File[],
  uploadErr: string,
) {
  if (!files.length) return [] as string[];
  const fd = new FormData();
  fd.set("entity_type", entityType);
  fd.set("entity_id", entityId);
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

export default function WmsPickupPage() {
  const { t, locale } = useLocale();
  const [queue, setQueue] = useState<SalesOrder[]>([]);
  const [resendQueue, setResendQueue] = useState<ResendPickupQueueItem[]>([]);
  const [selectedResendId, setSelectedResendId] = useState<string | null>(null);
  const [resendScan, setResendScan] = useState("");
  const [queueLoading, setQueueLoading] = useState(true);
  const [handoverMode, setHandoverMode] = useState<"batch" | "single">("batch");
  const [batch, setBatch] = useState<PickupBatchItem[]>([]);
  const [batchScan, setBatchScan] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [courierCompany, setCourierCompany] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [invoiceBySo, setInvoiceBySo] = useState<Record<string, string>>({});

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const [soQueue, resend] = await Promise.all([loadPickupQueue(), loadResendPickupQueue()]);
      setQueue(soQueue);
      setResendQueue(resend);
      setSelectedResendId((prev) =>
        prev && resend.some((r) => r.retur.id === prev) ? prev : null,
      );
    } catch (e) {
      setError(getErrorMessage(e));
      setQueue([]);
      setResendQueue([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    if (queue.length === 0) {
      setInvoiceBySo({});
      return;
    }
    let cancelled = false;
    void fetchMissingInvoiceNos(queue).then((map) => {
      if (!cancelled) setInvoiceBySo(map);
    });
    return () => {
      cancelled = true;
    };
  }, [queue]);

  const selectedResend = useMemo(
    () => resendQueue.find((r) => r.retur.id === selectedResendId) ?? null,
    [resendQueue, selectedResendId],
  );

  const batchIds = batch.map((b) => b.so.id);
  const batchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (handoverMode === "batch" && !loading && !saving) {
      batchInputRef.current?.focus();
    }
  }, [handoverMode, loading, saving, batch.length]);

  const deskCalls = useMemo(
    () =>
      queue
        .map((o) => ({ so: o, meta: describeOrderForQueue(o) }))
        .filter((x) => x.meta.deskRequestPending),
    [queue],
  );

  const resetBatchForm = useCallback(() => {
    setBatch([]);
    setBatchScan("");
    setDriverName("");
    setDriverPhone("");
    setCourierCompany("");
    setPhoto(null);
  }, []);

  const addBatchByScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const resendHit = resendQueue.find((r) => salesReturnResendScanMatches(r.retur, trimmed));
      if (resendHit) {
        setSelectedResendId(resendHit.retur.id);
        setResendScan(trimmed);
        setBatchScan("");
        setInfo(
          `${t("wms.pickup.resendTitle")}: ${returDisplayNo(resendHit.retur)} · PK ${resendHit.pickupNo}`,
        );
        return;
      }
      const { items, message } = await recordPickupBatchScan(trimmed, batch, t, queue);
      setBatch(items);
      setBatchScan("");
      setInfo(message);
    } catch (e) {
      setInfo("");
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const completeResendHandover = async () => {
    if (!selectedResend) {
      setError(t("wms.pickup.resendSelectFirst"));
      return;
    }
    const code = resendScan.trim() || selectedResend.pickupNo;
    if (!salesReturnResendScanMatches(selectedResend.retur, code)) {
      setError(t("wms.pickup.resendErrScan"));
      return;
    }
    if (!driverName.trim()) {
      setError(t("wms.permintaan.errCourierRequired"));
      return;
    }
    if (!photo) {
      setError(t("wms.pickup.errPhotoRequired"));
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const photoIds = await uploadPhotos(
        "biz_returs",
        selectedResend.retur.id,
        selectedResend.retur.warehouse || "",
        [photo],
        t("wms.pickup.errUploadPhoto"),
      );
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
      const res = await fetch("/api/wms/sales-return-resend/complete", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          returId: selectedResend.retur.id,
          scannedCode: code,
          driverName: driverName.trim(),
          driverPhone: driverPhone.trim(),
          courierCompany: courierCompany.trim() || undefined,
          photoIds,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || t("wms.pickup.resendErrScan"));
      setSelectedResendId(null);
      setResendScan("");
      setPhoto(null);
      setInfo(t("wms.pickup.resendDone"));
      await refreshQueue();
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
    if (!photo) {
      setError(t("wms.pickup.errPhotoRequired"));
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.pickup.errRelogin"));
      const batchId = createPickupBatchId();
      const ttNo = await allocateTtNo();
      const userName =
        typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined;
      const photoIds = await uploadPhotos(
        "biz_sales_orders",
        batch[0]!.so.id,
        batch[0]!.so.warehouse,
          [photo],
          t("wms.pickup.errUploadPhoto"),
        );

      const recordedAwbs = batch.map((b) => b.scannedAwb);
      const ttLines = await Promise.all(
        batch.map((b) => buildTtLineFromSo(b.so, b.scannedAwb, b.invoiceNo)),
      );

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
            physicalChecks: autoPhysicalChecks(),
            batchId,
            batchSize: batch.length,
            scannedAwb: item.scannedAwb,
            recordedAwbs,
            ttNo,
            ttLines,
          }),
        });
      }

      resetBatchForm();
      setInfo(t("wms.pickup.doneStayTt", { tt: ttNo, count: ttLines.length }));
      await refreshQueue();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const totalQueueCount = queue.length + resendQueue.length;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setHandoverMode("batch");
            setSelectedResendId(null);
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
            setSelectedResendId(null);
            setBatch([]);
            setError("");
          }}
          className={
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium " +
            (handoverMode === "single" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700")
          }
        >
          <Scan className="h-4 w-4" />
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

      {handoverMode === "batch" && deskCalls.length > 0 ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-950">
            {t("wms.desk.queueBadge")} — {deskCalls.length}
          </p>
          <ul className="mt-2 space-y-1">
            {deskCalls.map(({ so, meta }) => (
              <li key={so.id} className="text-sm text-amber-950">
                <span className="font-mono font-bold">PK {pkCodeBody(meta.pkNo)}</span>
                {meta.deskRequesterName ? ` · ${meta.deskRequesterName}` : ""}
                {meta.storeName && meta.storeName !== "—" ? ` · ${meta.storeName}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-900">{t("wms.desk.sendHint")}</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WmsCard>
            <div className="flex items-start justify-between gap-2">
              <WmsSectionTitle
                title={t("wms.pickup.queueTitle")}
                subtitle={
                  handoverMode === "batch"
                    ? t("wms.pickup.queueSubtitleBatch")
                    : t("wms.pickup.queueSubtitleSingle")
                }
              />
              <button
                type="button"
                onClick={() => void refreshQueue()}
                disabled={queueLoading}
                title={t("wms.order.refresh")}
                className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
              >
                {queueLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </button>
            </div>
            {queueLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : totalQueueCount === 0 ? (
              <p className="py-4 text-sm text-slate-500">{t("wms.pickup.queueEmpty")}</p>
            ) : (
              <ul className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
                {resendQueue.map((item) => {
                  const active = item.retur.id === selectedResendId;
                  return (
                    <li key={`ret-${item.retur.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedResendId(item.retur.id);
                          setResendScan(item.pickupNo);
                          setError("");
                          setInfo("");
                        }}
                        className={
                          "flex w-full flex-wrap items-start gap-2 rounded-lg border px-2 py-2 text-left text-sm transition " +
                          (active
                            ? "border-orange-400 bg-orange-50"
                            : "border-orange-200 hover:bg-orange-50/60")
                        }
                      >
                        <WmsBadge tone="amber">RET</WmsBadge>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-baseline gap-1.5 font-mono text-xl font-bold tracking-wide text-orange-800">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              PK
                            </span>
                            <span>{pkCodeBody(item.pickupNo)}</span>
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-orange-950">
                              RET: {returDisplayNo(item.retur)}
                            </span>
                            <WmsBadge tone="amber">
                              {item.method === "ship"
                                ? t("wms.pickup.resendMethodShip")
                                : t("wms.pickup.resendMethodPickup")}
                            </WmsBadge>
                          </div>
                          {item.retur.created ? (
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {locale === "en" ? "Txn date" : "Tgl transaksi"}:{" "}
                              {new Date(item.retur.created).toLocaleString(
                                locale === "en" ? "en-GB" : "id-ID",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-xs text-slate-600">{item.customerName}</p>
                          {item.shippingSummary ? (
                            <p className="mt-0.5 text-[11px] text-orange-900/80">
                              {item.shippingSummary}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {queue.map((so) => {
                  const meta = describeOrderForQueue(so);
                  const inBatch = batchIds.includes(so.id);
                  const hasPk = meta.pkNo !== "—";
                  return (
                    <li key={`inv-${so.id}`}>
                      <div
                        className={
                          "flex w-full gap-2 rounded-lg border px-2 py-2 text-left text-sm " +
                          (inBatch
                            ? "border-cyan-400 bg-cyan-50"
                            : "border-slate-200")
                        }
                      >
                        <WmsBadge tone="indigo">INV</WmsBadge>
                        <div className="min-w-0 flex-1">
                          {hasPk ? (
                            <p className="flex items-baseline gap-1.5 font-mono text-xl font-bold tracking-wide text-indigo-700">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                PK
                              </span>
                              <span>{pkCodeBody(meta.pkNo)}</span>
                            </p>
                          ) : (
                            <p className="font-mono text-sm font-medium text-amber-800">
                              {t("wms.order.pkNotCreatedQueue")}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            {meta.invoiceNo || invoiceBySo[so.id] ? (
                              <>
                                INV:{" "}
                                <span className="font-mono">
                                  {meta.invoiceNo || invoiceBySo[so.id]}
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
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {!queueLoading && totalQueueCount > 0 ? (
              <p className="mt-2 text-center text-xs text-slate-400">
                {t("wms.pickup.queueUnifiedCount", {
                  ret: resendQueue.length,
                  inv: queue.length,
                })}
              </p>
            ) : null}
          </WmsCard>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {selectedResend ? (
            <WmsCard className="border-orange-200 bg-orange-50/40">
              <WmsSectionTitle
                title={t("wms.pickup.resendTitle")}
                subtitle={t("wms.pickup.resendSubtitle")}
              />
              <p className="mt-2 text-sm font-semibold text-orange-950">
                {returDisplayNo(selectedResend.retur)} · PK {pkCodeBody(selectedResend.pickupNo)}
              </p>
              <p className="mt-1 text-xs text-slate-600">{t("wms.pickup.resendScanHint")}</p>
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-lg border-2 border-orange-300 px-3 py-2 font-mono text-sm"
                  placeholder={t("wms.pickup.resendScanPlaceholder")}
                  value={resendScan}
                  onChange={(e) => setResendScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void completeResendHandover();
                    }
                  }}
                />
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
                <ValidatePackPhotoCapture
                  maxPhotos={WMS_PICKUP_PHOTO_MAX}
                  uploadedCount={photo ? 1 : 0}
                  uploading={false}
                  title={t("wms.pickup.photoTitle")}
                  subtitle={t("wms.pickup.photoSubtitle")}
                  onCapture={(file) => setPhoto(file)}
                  onRemoveUploaded={() => setPhoto(null)}
                />
        <div className="flex flex-wrap gap-2">
                  <WmsPrimaryButton
                    disabled={saving || !photo}
                    onClick={() => void completeResendHandover()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="mr-2 inline h-4 w-4" />
                    )}
                    {t("wms.pickup.resendComplete")}
                  </WmsPrimaryButton>
          <button
            type="button"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
            onClick={() => {
                      setSelectedResendId(null);
                      setResendScan("");
              setError("");
                      setInfo("");
            }}
          >
                    {t("common.cancel")}
          </button>
        </div>
          </div>
            </WmsCard>
          ) : handoverMode === "batch" ? (
              <WmsCard className="border-cyan-200">
                <WmsSectionTitle
                  title={t("wms.pickup.batchTitle")}
                  subtitle={t("wms.pickup.batchSubtitle", { count: batch.length })}
                />
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

                <div className="mt-4 rounded-xl border-2 border-cyan-300 bg-cyan-50/80 p-4">
                <p className="text-sm font-bold text-cyan-950">{t("wms.pickup.scanLabelMain")}</p>
                <p className="mt-1 text-xs text-cyan-900">{t("wms.pickup.scanLabelHint")}</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={batchInputRef}
                      className="flex-1 rounded-lg border-2 border-cyan-400 bg-white px-3 py-3 font-mono text-base"
                    placeholder={t("wms.pickup.scanLabelPlaceholder")}
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
                  <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <th className="px-3 py-2">{t("wms.pickup.colStore")}</th>
                        <th className="px-3 py-2">{t("wms.pickup.colInv")}</th>
                        <th className="px-3 py-2">{t("wms.pickup.colScanned")}</th>
                          <th className="px-3 py-2">{t("wms.pickup.colTime")}</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {batch.map((item) => (
                          <tr key={item.so.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-xs font-medium text-slate-800">
                            {item.storeName}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {item.invoiceNo}
                          </td>
                            <td className="px-3 py-2 font-mono text-sm font-bold text-indigo-900">
                              {item.scannedAwb}
                            </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {new Date(item.recordedAt).toLocaleString(
                              locale === "en" ? "en-US" : "id-ID",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              },
                            )}
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

              <div className="mt-4">
                <ValidatePackPhotoCapture
                  maxPhotos={WMS_PICKUP_PHOTO_MAX}
                  uploadedCount={photo ? 1 : 0}
                  uploading={false}
                  title={t("wms.pickup.photoTitle")}
                  subtitle={t("wms.pickup.photoSubtitle")}
                  onCapture={(file) => setPhoto(file)}
                  onRemoveUploaded={() => setPhoto(null)}
                />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <WmsPrimaryButton
                  disabled={saving || batch.length === 0 || !photo}
                    onClick={() => void completeBatchPickup()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Truck className="mr-2 inline h-4 w-4" />
                    )}
                  {t("wms.pickup.saveBatch", { count: batch.length })}
                  </WmsPrimaryButton>
                  {batch.length > 0 ? (
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    onClick={() => {
                      setBatch([]);
                      setPhoto(null);
                    }}
                    >
                      {t("wms.pickup.clearBatch")}
                    </button>
                  ) : null}
                </div>
              </WmsCard>
          ) : (
            <WmsPickupDeskKiosk onSubmitted={() => void refreshQueue()} />
            )}
          </div>
        </div>
    </>
  );
}
