"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Scan,
  CheckCircle2,
} from "lucide-react";
import { ValidatePackFlowModal } from "@/components/wms/ValidatePackFlowModal";
import { InvoiceAccessGuidePanel } from "@/components/wms/InvoiceAccessGuidePanel";
import { AwbLabelPrintActions } from "@/components/wms/AwbLabelPrintActions";
import { PkLabelPrintActions } from "@/components/wms/PkLabelPrintActions";
import { pb } from "@/lib/pocketbase";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { ValidateOrderSummary } from "@/components/wms/ValidateOrderSummary";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { loadValidateQueue, isSoAwaitingValidation } from "@/lib/wms/outbound-queues";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  isValidateComplete,
  type OutboundWorkflow,
} from "@/lib/wms/outbound-workflow";
import { mergeOutboundWorkflowForOrder } from "@/lib/wms/merge-outbound-workflow-client";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { validateBarcodeScan } from "@/lib/wms/validations";
import { getErrorMessage } from "@/lib/errors";
import { findSalesOrderByScanRef, orderMatchesScanRef } from "@/lib/wms/outbound-order-lookup";
import { buildWmsLineViewsFromPickLines } from "@/lib/wms/wms-order-display";
import { INV_COLLECTIONS, type InvProduct } from "@/lib/inventory/types";
import {
  buildValidateOrderContext,
  hydrateSalesOrderDisplay,
} from "@/lib/wms/validate-order-context";
import {
  ensureValidatePackSession,
  resetValidationScanProgress,
  validationProgress,
} from "@/lib/wms/validate-pack-session";
import { assertSessionAllowsValidation } from "@/lib/wms/workstation-session";
import { useValidatorWorkstationApi } from "@/components/wms/ValidatorWorkstationProvider";
import { useOutboundOrderFromQuery } from "@/lib/wms/use-outbound-order-from-query";
import { WMS_PACK_PHOTO_MAX } from "@/lib/wms/wms-media-limits";
import { orderMatchesPkScan } from "@/lib/wms/pk-identity";
import { prefetchEnsureAwbLabel } from "@/lib/bisnis/awb-label-client";
import { getWmsFulfillmentMode, isWmsShipFulfillment } from "@/lib/wms/fulfillment-mode";
import { useLocale } from "@/components/LocaleProvider";
import type { ValidatePackFlowStep } from "@/components/wms/ValidatePackFlowModal";

function prefetchEnsurePackingInvoice(soId: string): void {
  const token = pb.authStore.token;
  if (!token) return;
  void fetch(`/api/wms/sales-orders/${soId}/ensure-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ wmsPickComplete: true }),
  }).catch(() => {
    /* prefetch — jangan ganggu UI packing */
  });
}

async function uploadPackPhotos(soId: string, warehouse: string, files: File[], uploadErr: string) {
  if (!files.length) return [] as string[];
  const fd = new FormData();
  fd.set("entity_type", "biz_sales_orders");
  fd.set("entity_id", soId);
  fd.set("warehouse", warehouse || "");
  fd.set("purpose", "validate_pack");
  for (const file of files) {
    fd.append("files", file);
  }
  const res = await fetch("/api/wms/photos", { method: "POST", body: fd, credentials: "include" });
  const json = (await res.json()) as { ok?: boolean; file_ids?: string[]; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? uploadErr);
  return json.file_ids ?? [];
}

const emptyPacking = () => ({
  weight_kg: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  colli_count: "1",
});

function pickLinesLookExpanded(wf: OutboundWorkflow): boolean {
  const lines = Object.values(wf.pick?.lines ?? {});
  if (lines.length === 0) return false;
  return lines.every((l) => !!(l.sku?.trim() || l.name?.trim()));
}

export default function WmsValidasiPage() {
  const { t } = useLocale();
  const [queue, setQueue] = useState<SalesOrder[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [so, setSo] = useState<SalesOrder | null>(null);
  const deskApi = useValidatorWorkstationApi();
  const workstation = deskApi.workstation;
  const deskSession = deskApi.session;
  const [scanQueue, setScanQueue] = useState("");
  const [scanProduct, setScanProduct] = useState("");
  const [scanPackage, setScanPackage] = useState("");
  const [packageVerified, setPackageVerified] = useState(false);
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineViews, setLineViews] = useState<ReturnType<typeof buildWmsLineViewsFromPickLines>>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [packing, setPacking] = useState(emptyPacking());
  const [flowModalOpen, setFlowModalOpen] = useState(false);
  const [flowModalStep, setFlowModalStep] = useState<ValidatePackFlowStep>("awb");
  const [awbLabelAttached, setAwbLabelAttached] = useState(false);
  /** Langkah 1: QR invoice + packing list sudah dicetak/dikonfirmasi. */
  const [invoiceQrReady, setInvoiceQrReady] = useState(false);
  const autoFinishForSoRef = useRef<string | null>(null);

  const refreshQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      setQueue(await loadValidateQueue());
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

  /** Pre-warm status AWB (GET saja) — jangan generate / ensure-invoice massal di antrean. */
  useEffect(() => {
    if (queueLoading || queue.length === 0) return;
    const slice = queue.slice(0, 6);
    for (const o of slice) {
      if (isWmsShipFulfillment(o)) prefetchEnsureAwbLabel(o.id);
    }
  }, [queue, queueLoading]);

  const validatorAudit = useCallback(() => {
    const user = pb.authStore.model;
    const userId = user?.id ?? "";
    return {
      userId,
      userName: typeof user?.name === "string" ? user.name : undefined,
      userRole: String((user as { role?: string })?.role ?? "staff"),
      workstation,
      workstationSessionId: deskSession?.id,
    };
  }, [workstation, deskSession]);

  const requireValidationSession = useCallback((): boolean => {
    const userId = pb.authStore.model?.id ?? "";
    try {
      assertSessionAllowsValidation(
        deskSession && workstation
          ? {
              id: deskSession.id,
              userId: deskSession.userId,
              workstation,
              channel: deskSession.channel,
              bonusEligible: deskSession.bonusEligible,
              checkInAt: deskSession.checkInAt,
              needsBind: deskSession.needsBind,
            }
          : null,
        userId,
      );
      return true;
    } catch (e) {
      setError(getErrorMessage(e));
      return false;
    }
  }, [deskSession, workstation]);

  const resetWorkOrder = () => {
    autoFinishForSoRef.current = null;
    setSo(null);
    setLineViews([]);
    setScanProduct("");
    setScanPackage("");
    setPackageVerified(false);
    setUploadedPhotoIds([]);
    setPhotoUploading(false);
    setPacking(emptyPacking());
    setFlowModalOpen(false);
    setFlowModalStep("awb");
    setAwbLabelAttached(false);
    setInvoiceQrReady(false);
  };

  const openOrder = useCallback(
    async (row: SalesOrder) => {
      if (row.id === so?.id) return;

      const wf0 = parseOutboundWorkflow(row.outbound_workflow_json);
      if (!isSoAwaitingValidation(row)) {
        setError(t("wms.validasi.errNotInQueue"));
        return;
      }
      if (wf0.stage === "picking") {
        setError(t("wms.permintaan.errPickingNotDone"));
        return;
      }
      setError("");
      autoFinishForSoRef.current = null;
      setOpeningOrderId(row.id);
      setInfo("");
      try {
        const wfBase = parseOutboundWorkflow(row.outbound_workflow_json);
        const wfExpanded = pickLinesLookExpanded(wfBase)
          ? wfBase
          : await mergeOutboundWorkflowForOrder(row.id, wfBase);
        // Selalu mulai dari 0 — hindari kondisi menggantung (mis. 3/3 valid tapi belum selesai).
        const wfFresh = resetValidationScanProgress(wfExpanded);
        const wfJson = serializeOutboundWorkflow(wfFresh);
        let displaySo = row;
        if (wfJson !== row.outbound_workflow_json) {
          displaySo = await pb.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(
            row.id,
            { outbound_workflow_json: wfJson },
          );
        }
        const pickLines = wfFresh.pick?.lines ?? {};
        const componentIds = Object.keys(pickLines);
        const productExpand: Record<string, InvProduct> = {};
        if (componentIds.length > 0 && !pickLinesLookExpanded(wfFresh)) {
          const filter = componentIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
          const products = await pb.collection(INV_COLLECTIONS.products).getFullList<InvProduct>({
            filter,
            requestKey: null,
          });
          for (const p of products) productExpand[p.id] = p;
        }
        setLineViews(buildWmsLineViewsFromPickLines(pickLines, {}, productExpand));
        const hydrated = await hydrateSalesOrderDisplay({
          ...displaySo,
          expand: row.expand ?? displaySo.expand,
        });
        setSo(hydrated);
        setPacking(emptyPacking());
        setUploadedPhotoIds([]);
        setPackageVerified(false);
        setScanPackage("");
        setScanProduct("");
        autoFinishForSoRef.current = null;
        setAwbLabelAttached(false);
        setInvoiceQrReady(false);
        setFlowModalOpen(false);
        setFlowModalStep("awb");
        if (isWmsShipFulfillment(hydrated)) prefetchEnsureAwbLabel(hydrated.id);
        prefetchEnsurePackingInvoice(hydrated.id);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setOpeningOrderId(null);
      }
    },
    [t, so?.id],
  );

  useOutboundOrderFromQuery(queue, queueLoading, so?.id, openOrder);

  const loadByRef = useCallback(
    async (code: string) => {
      setScanBusy(true);
      setError("");
      try {
        const row = await findSalesOrderByScanRef(code, { onlyAwaitingValidation: true });
        if (!row) throw new Error(t("wms.validasi.errOrderNotFound"));
        await openOrder(row);
      } catch (e) {
        setSo(null);
        setError(getErrorMessage(e));
      } finally {
        setScanBusy(false);
      }
    },
    [openOrder, t],
  );

  const wf = so ? parseOutboundWorkflow(so.outbound_workflow_json) : null;
  const fulfillmentMode = so ? getWmsFulfillmentMode(so) : "ship";
  const isPickupFulfillment = fulfillmentMode === "pickup";
  const progress = useMemo(() => validationProgress(lineViews), [lineViews]);
  const allSkuValid = wf ? isValidateComplete(wf) : false;

  useEffect(() => {
    if (!so || !invoiceQrReady || !allSkuValid || awbLabelAttached || flowModalOpen) return;
    setFlowModalStep("awb");
    setFlowModalOpen(true);
  }, [so, invoiceQrReady, allSkuValid, awbLabelAttached, flowModalOpen]);

  const persistWorkflow = async (nextWf: ReturnType<typeof parseOutboundWorkflow>) => {
    if (!so) return;
    const json = serializeOutboundWorkflow(nextWf);
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(so.id, {
      outbound_workflow_json: json,
    });
    setSo({ ...so, outbound_workflow_json: json });
  };

  const handleProductScan = async () => {
    if (!so || !wf) return;
    if (!invoiceQrReady) {
      setError(t("wms.validasi.guideNeedQrFirst"));
      return;
    }
    if (!requireValidationSession()) return;
    deskApi.touchActivity();
    const ws = workstation!;
    const clearScanReady = () => {
      setScanProduct("");
      window.setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-validate-scan-input]")?.focus();
      }, 0);
    };
    try {
      let activeSo = so;
      let activeWf = wf;
      if (!wf.validate_pack?.started_at) {
        const sessionSo = await ensureValidatePackSession(so, validatorAudit());
        if (sessionSo.outbound_workflow_json !== so.outbound_workflow_json) {
          activeSo = { ...so, outbound_workflow_json: sessionSo.outbound_workflow_json };
          setSo(activeSo);
        }
        activeWf = parseOutboundWorkflow(activeSo.outbound_workflow_json);
      }
      const product = await validateBarcodeScan(scanProduct);
      const key = product.id;
      const line = activeWf.pick?.lines?.[key];
      if (!line) {
        setError(t("wms.validasi.errSkuNotInOrder", { sku: product.sku }));
        clearScanReady();
        return;
      }
      const nextValidated = line.qty_validated + 1;
      if (nextValidated > line.qty_required) {
        setError(t("wms.validasi.errQtyExceeded"));
        clearScanReady();
        return;
      }
      const audit = validatorAudit();
      const nextWf = {
        ...activeWf,
        validate_pack: {
          ...activeWf.validate_pack,
          user_id: audit.userId,
          user_name: audit.userName,
          user_role: audit.userRole,
          started_at: activeWf.validate_pack?.started_at ?? new Date().toISOString(),
          workstation_code: ws.code,
          workstation_cctv: ws.cctv,
        },
      };
      nextWf.pick!.lines[key] = { ...line, qty_validated: nextValidated };
      await persistWorkflow(nextWf);
      const wfNext = parseOutboundWorkflow(serializeOutboundWorkflow(nextWf));
      setLineViews((prev) =>
        prev.map((v) => ({
          ...v,
          validated: wfNext.pick?.lines?.[v.productId]?.qty_validated ?? v.validated,
        })),
      );
      setError("");
      clearScanReady();
    } catch (e) {
      setError(getErrorMessage(e));
      clearScanReady();
    }
  };

  const verifyPackageScan = async () => {
    if (!so || !wf) return;
    if (orderMatchesScanRef(so, scanPackage) || orderMatchesPkScan(so, scanPackage)) {
      setPackageVerified(true);
      setError("");
      try {
        const nextWf = {
          ...wf,
          validate_pack: {
            user_id: wf.validate_pack?.user_id ?? "",
            ...wf.validate_pack,
            package_code_verified: true,
            package_code_verified_at: new Date().toISOString(),
          },
        };
        await persistWorkflow(nextWf);
      } catch (e) {
        setError(getErrorMessage(e));
      }
    } else {
      setPackageVerified(false);
      setError(t("wms.validasi.errPkMismatch"));
    }
  };

  const confirmAwbAttached = useCallback(async () => {
    if (!so || !wf) return;
    const now = new Date().toISOString();
    const nextWf = {
      ...wf,
      validate_pack: {
        ...wf.validate_pack,
        user_id: wf.validate_pack?.user_id ?? pb.authStore.model?.id ?? "",
        label_attached: true,
        package_code_verified: true,
        package_code_verified_at: now,
      },
    };
    await persistWorkflow(nextWf);
    setPackageVerified(true);
    setAwbLabelAttached(true);
    setFlowModalStep("photo");
  }, [so, wf, persistWorkflow]);

  const finishValidate = useCallback(async (photoIdsOverride?: string[]) => {
    if (!so || !wf) return;
    if (!requireValidationSession()) return;
    deskApi.touchActivity();
    const ws = workstation!;
    if (!allSkuValid) {
      setError(t("wms.permintaan.errAllValid"));
      return;
    }
    if (!invoiceQrReady) {
      setError(t("wms.validasi.guideNeedQrFirst"));
      return;
    }
    if (!awbLabelAttached) {
      setError(
        t(isPickupFulfillment ? "wms.validasi.errPkNotAttached" : "wms.validasi.errAwbNotAttached"),
      );
      return;
    }
    const photoIds = photoIdsOverride ?? uploadedPhotoIds;
    if (photoIds.length > WMS_PACK_PHOTO_MAX) {
      setError(t("wms.validasi.errMaxPhotos", { max: WMS_PACK_PHOTO_MAX }));
      return;
    }
    if (photoIds.length < 1) {
      setError(t("wms.validasi.errMinPhoto"));
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.validasi.errRelogin"));

      const audit = validatorAudit();
      await updateSalesWarehouseProcess(so.id, userId, "complete_validate_pack", {
        userName: audit.userName,
        validatorRole: audit.userRole,
        workstation: ws,
        workstationSessionId: deskSession?.id,
        validateStartedAt: wf.validate_pack?.started_at,
        packageCodeVerified: true,
        packPhotoIds: photoIds,
        packing: {
          weight_kg: packing.weight_kg ? Number(packing.weight_kg) : undefined,
          length_cm: packing.length_cm ? Number(packing.length_cm) : undefined,
          width_cm: packing.width_cm ? Number(packing.width_cm) : undefined,
          height_cm: packing.height_cm ? Number(packing.height_cm) : undefined,
          colli_count: packing.colli_count ? Number(packing.colli_count) : 1,
        },
      });
      resetWorkOrder();
      setScanQueue("");
      setInfo(t("wms.validasi.doneStay"));
      await refreshQueue();
    } catch (e) {
      setError(getErrorMessage(e));
      autoFinishForSoRef.current = null;
    } finally {
      setSaving(false);
    }
  }, [
    so,
    wf,
    workstation,
    deskSession,
    deskApi,
    requireValidationSession,
    allSkuValid,
    invoiceQrReady,
    awbLabelAttached,
    isPickupFulfillment,
    validatorAudit,
    packing,
    refreshQueue,
    t,
  ]);

  const handlePackPhotoCapture = useCallback(
    async (file: File) => {
      if (!so || !wf) return;
      deskApi.touchActivity();
      if (uploadedPhotoIds.length >= WMS_PACK_PHOTO_MAX) {
        setError(t("wms.validasi.errMaxPhotos", { max: WMS_PACK_PHOTO_MAX }));
        return;
      }
      setPhotoUploading(true);
      setError("");
      try {
        const ids = await uploadPackPhotos(so.id, so.warehouse ?? "", [file], t("wms.validasi.errUploadPhoto"));
        const nextPhotoIds = [...uploadedPhotoIds, ...ids].slice(0, WMS_PACK_PHOTO_MAX);
        setUploadedPhotoIds(nextPhotoIds);

        const ws = workstation;
        const sessionOk = !!ws && !!deskSession && !deskSession.needsBind;
        const atMax = nextPhotoIds.length >= WMS_PACK_PHOTO_MAX;
        const ready =
          atMax &&
          isValidateComplete(wf) &&
          awbLabelAttached &&
          sessionOk;

        // Foto ke-3 (maks) → selesai otomatis. 1–2 foto: operator tekan Simpan.
        if (ready && autoFinishForSoRef.current !== so.id) {
          autoFinishForSoRef.current = so.id;
          setPhotoUploading(false);
          await finishValidate(nextPhotoIds);
          return;
        }
      } catch (e) {
        setError(getErrorMessage(e));
        autoFinishForSoRef.current = null;
      } finally {
        setPhotoUploading(false);
      }
    },
    [
      so,
      wf,
      uploadedPhotoIds,
      awbLabelAttached,
      workstation,
      deskSession,
      finishValidate,
      t,
    ],
  );

  const runWarehouseAction = async (
    action: "validation_failed" | "return_to_picking" | "cancel_order",
    note?: string,
  ) => {
    if (!so) return;
    const userId = pb.authStore.model?.id;
    if (!userId) {
      setError(t("wms.validasi.errRelogin"));
      return;
    }
    setSaving(true);
    try {
      await updateSalesWarehouseProcess(so.id, userId, action, {
        note,
        userName: typeof pb.authStore.model?.name === "string" ? pb.authStore.model.name : undefined,
      });
      resetWorkOrder();
      await refreshQueue();
      if (action === "return_to_picking") {
        setInfo(t("wms.validasi.returnedToPickingStay"));
      } else if (action === "validation_failed") {
        setInfo(t("wms.validasi.validationFailedStay"));
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const photoReady = uploadedPhotoIds.length > 0;
  const sessionReady = deskApi.sessionReady;

  const completionBlockers = useMemo(() => {
    const items: string[] = [];
    if (!invoiceQrReady) items.push(t("wms.validasi.blockerInvoiceQr"));
    if (!allSkuValid) items.push(t("wms.validasi.blockerAllSku"));
    if (!awbLabelAttached) {
      items.push(t(isPickupFulfillment ? "wms.validasi.blockerPk" : "wms.validasi.blockerAwb"));
    }
    if (!photoReady) items.push(t("wms.validasi.blockerPhoto"));
    if (!sessionReady) items.push(t("wms.validasi.blockerSession"));
    return items;
  }, [invoiceQrReady, allSkuValid, awbLabelAttached, isPickupFulfillment, photoReady, sessionReady, t]);

  const canComplete = completionBlockers.length === 0;

  const orderCtx = so ? buildValidateOrderContext(so) : null;

  return (
    <>
        {error || deskApi.localError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error || deskApi.localError}
          </div>
        ) : null}
        {info ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {info}
          </div>
        ) : null}

        <div className="grid h-[calc(100dvh-8.5rem)] min-h-[32rem] grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-3 lg:col-span-1">
            <OutboundOrderQueue
              fillHeight
              showPkPrintStatus={false}
              title={t("wms.validasi.queueTitle")}
              subtitle={t("wms.validasi.queueSubtitle")}
              orders={queue}
              selectedId={so?.id}
              loading={queueLoading}
              emptyText={t("wms.validasi.queueEmpty")}
              onRefresh={() => void refreshQueue()}
              onSelect={(o) => void openOrder(o)}
            />
            <WmsCard className="shrink-0">
              <WmsSectionTitle title={t("wms.permintaan.openOrder")} subtitle={t("wms.validasi.openOrderSubtitle")} />
              <div className="mt-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder={t("wms.validasi.scanPkPlaceholder")}
                  value={scanQueue}
                  onChange={(e) => setScanQueue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadByRef(scanQueue);
                  }}
                />
                <WmsPrimaryButton
                  type="button"
                  disabled={scanBusy || !scanQueue.trim()}
                  onClick={() => void loadByRef(scanQueue)}
                >
                  {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                </WmsPrimaryButton>
              </div>
            </WmsCard>
          </div>

          <div className="flex min-h-0 flex-col gap-3 lg:col-span-2">
            {openingOrderId ? (
              <WmsCard className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                {t("wms.validasi.openingOrder")}
              </WmsCard>
            ) : !so || !orderCtx ? (
              <WmsCard className="flex flex-1 items-center justify-center text-center text-sm text-slate-500">
                {t("wms.validasi.selectOrScan")}
              </WmsCard>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
                {/* Tahap 1: cetak QR — scan baru muncul setelah ini */}
                {!invoiceQrReady ? (
                  <InvoiceAccessGuidePanel
                    salesOrderId={so.id}
                    orderNo={so.order_no}
                    refreshKey={`${so.status}-${so.updated}`}
                    confirmed={invoiceQrReady}
                    requirePrintBeforeConfirm
                    onConfirmed={() => {
                      setInvoiceQrReady(true);
                      setError("");
                      requestAnimationFrame(() => {
                        const el = document.querySelector<HTMLInputElement>(
                          "[data-validate-scan-input]",
                        );
                        el?.focus();
                      });
                    }}
                  />
                ) : (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-900">
                    {t("wms.validasi.guideQrDone")}
                  </p>
                )}

                <ValidateOrderSummary ctx={orderCtx} compact />

                {/* Tahap 2: validasi — hanya setelah cetak QR */}
                {invoiceQrReady ? (
                  <>
                    <WmsCard className="shrink-0 border-2 border-indigo-200">
                      <WmsSectionTitle
                        title={t("wms.validasi.scanProduct")}
                        subtitle={t("wms.validasi.scanProductSubtitle")}
                      />
                      {!sessionReady ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                          {t("wms.validasi.needDeskToValidate")}
                        </p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <input
                          data-validate-scan-input
                          autoFocus={sessionReady}
                          disabled={!sessionReady}
                          className="flex-1 rounded-xl border-2 border-indigo-200 px-4 py-3 font-mono text-lg disabled:bg-slate-50 disabled:text-slate-400"
                          placeholder={t("wms.validasi.scanProductPlaceholder")}
                          value={scanProduct}
                          onChange={(e) => setScanProduct(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void handleProductScan()}
                        />
                        <WmsPrimaryButton
                          type="button"
                          disabled={!sessionReady}
                          onClick={() => void handleProductScan()}
                        >
                          <Scan className="h-5 w-5" />
                        </WmsPrimaryButton>
                      </div>
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-600">
                          {t("wms.validasi.progressSummary", {
                            total: progress.totalSku,
                            valid: progress.validSku,
                            pending: progress.pendingSku,
                            scanned: progress.scannedQty,
                            totalQty: progress.totalQty,
                          })}
                          <span className="ml-2 font-bold text-emerald-700">{progress.pct}%</span>
                        </p>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      </div>
                    </WmsCard>

                    <WmsCard className="shrink-0">
                      <WmsSectionTitle
                        title={t("wms.validasi.productsTitle")}
                        subtitle={t("wms.validasi.productsSubtitleScan")}
                      />
                      <div className="mt-2 overflow-x-auto">
                        {lineViews.length === 0 ? (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                            {t("wms.validasi.productsEmpty")}
                          </p>
                        ) : (
                          <table className="w-full min-w-[520px] text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                                <th className="px-3 py-2">{t("wms.hub.colSku")}</th>
                                <th className="px-3 py-2">{t("wms.validasi.colProductName")}</th>
                                <th className="px-3 py-2 text-right">{t("wms.validasi.colQtyOrder")}</th>
                                <th className="px-3 py-2 text-right">{t("wms.validasi.colQtyScan")}</th>
                                <th className="px-3 py-2 text-center">{t("wms.validasi.colStatus")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineViews.map((l) => {
                                const valid = l.validated >= l.qty && l.qty > 0;
                                return (
                                  <tr key={l.productId} className="border-b border-slate-100">
                                    <td className="px-3 py-2 font-mono text-xs text-indigo-700">{l.sku}</td>
                                    <td className="px-3 py-2 font-medium">
                                      {l.name}
                                      {l.bundleLabel ? (
                                        <span className="mt-0.5 block text-[11px] font-normal text-amber-800">
                                          {t("wms.validasi.bundleFor", { label: l.bundleLabel })}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">{l.qty}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{l.validated}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span
                                        className={
                                          "inline-block rounded-full px-2 py-0.5 text-xs font-bold " +
                                          (valid
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-amber-100 text-amber-900")
                                        }
                                      >
                                        {valid
                                          ? t("wms.validasi.statusValid")
                                          : t("wms.validasi.statusNotValid")}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {allSkuValid && !awbLabelAttached ? (
                        <p className="mt-3 text-sm font-medium text-indigo-800">
                          {t(
                            isPickupFulfillment
                              ? "wms.validasi.allValidOpenPk"
                              : "wms.validasi.allValidOpenAwb",
                          )}
                        </p>
                      ) : null}

                      {completionBlockers.length > 0 && allSkuValid ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                          <p className="font-semibold">{t("wms.validasi.cannotComplete")}</p>
                          <ul className="mt-1 list-inside list-disc text-xs">
                            {completionBlockers.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      ) : saving ? (
                        <p className="mt-3 text-sm font-medium text-indigo-800">
                          {t("wms.validasi.autoFinishing")}
                        </p>
                      ) : allSkuValid ? (
                        <p className="mt-3 text-sm font-medium text-emerald-700">
                          {t("wms.validasi.completeReady")}
                        </p>
                      ) : null}

                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-50"
                            onClick={() => {
                              const reason = window.prompt(t("wms.validasi.promptValidationFailed"));
                              if (reason === null) return;
                              if (!reason.trim()) {
                                setError(t("wms.validasi.errValidationFailedReason"));
                                return;
                              }
                              void runWarehouseAction("validation_failed", reason.trim());
                            }}
                          >
                            {t("wms.validasi.validationFailed")}
                          </button>
                          <WmsPrimaryButton
                            disabled={saving}
                            onClick={() => {
                              if (!canComplete) {
                                setError(completionBlockers.join(" "));
                                return;
                              }
                              void finishValidate(undefined);
                            }}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                            )}
                            {t("wms.validasi.validationComplete")}
                          </WmsPrimaryButton>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">
                          {t("wms.validasi.validatorScopeHint")}
                        </p>
                      </div>
                    </WmsCard>

                    <details className="shrink-0 rounded-lg border border-slate-200 bg-white">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600">
                        {t(
                          isPickupFulfillment
                            ? "wms.validasi.pkPreviewTitle"
                            : "wms.validasi.awbPreviewTitle",
                        )}
                      </summary>
                      <div className="border-t border-slate-100 p-2">
                        {isPickupFulfillment ? (
                          <PkLabelPrintActions so={so} compact />
                        ) : (
                          <AwbLabelPrintActions so={so} compact />
                        )}
                      </div>
                    </details>
                  </>
                ) : (
                  <WmsCard className="shrink-0">
                    <WmsSectionTitle
                      title={t("wms.validasi.productsTitle")}
                      subtitle={t("wms.validasi.productsSubtitleBeforePrint")}
                    />
                    <div className="mt-2 overflow-x-auto">
                      {lineViews.length === 0 ? (
                        <p className="text-xs text-slate-500">{t("wms.validasi.productsEmpty")}</p>
                      ) : (
                        <table className="w-full min-w-[400px] text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                              <th className="px-3 py-2">{t("wms.hub.colSku")}</th>
                              <th className="px-3 py-2">{t("wms.validasi.colProductName")}</th>
                              <th className="px-3 py-2 text-right">{t("wms.validasi.colQtyOrder")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineViews.map((l) => (
                              <tr key={l.productId} className="border-b border-slate-100">
                                <td className="px-3 py-2 font-mono text-xs text-indigo-700">{l.sku}</td>
                                <td className="px-3 py-2 font-medium">{l.name}</td>
                                <td className="px-3 py-2 text-right font-semibold">{l.qty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{t("wms.validasi.guideNeedQrFirst")}</p>
                  </WmsCard>
                )}
              </div>
            )}
          </div>
        </div>

        {so && flowModalOpen ? (
          <ValidatePackFlowModal
            open={flowModalOpen}
            step={flowModalStep}
            so={so}
            fulfillmentMode={fulfillmentMode}
            uploadedPhotoCount={uploadedPhotoIds.length}
            photoUploading={photoUploading}
            saving={saving}
            onAwbConfirm={() => void confirmAwbAttached()}
            onPhotoCapture={handlePackPhotoCapture}
            onPhotoFinish={() => void finishValidate(undefined)}
            onPhotoRemove={() => {
              setUploadedPhotoIds([]);
              autoFinishForSoRef.current = null;
            }}
            onBackToQueue={() => {
              setFlowModalOpen(false);
              setFlowModalStep("awb");
              setAwbLabelAttached(false);
              resetWorkOrder();
            }}
            onCancelOrder={() => {
              const reason = window.prompt(t("wms.validasi.promptValidationFailed"));
              if (reason === null) return;
              if (!reason.trim()) {
                setError(t("wms.validasi.errValidationFailedReason"));
                return;
              }
              setFlowModalOpen(false);
              void runWarehouseAction("validation_failed", reason.trim());
            }}
          />
        ) : null}

    </>
  );
}
