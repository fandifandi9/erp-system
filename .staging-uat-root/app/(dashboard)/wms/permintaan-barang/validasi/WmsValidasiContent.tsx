"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Scan,
  CheckCircle2,
} from "lucide-react";
import { ValidatePackPhotoCapture } from "@/components/wms/ValidatePackPhotoCapture";
import { AwbLabelPrintActions } from "@/components/wms/AwbLabelPrintActions";
import { InvoicePackQrPanel } from "@/components/wms/InvoicePackQrPanel";
import { pb } from "@/lib/pocketbase";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle } from "@/components/wms/ui";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";
import { OutboundFlowBar } from "@/components/wms/OutboundFlowBar";
import { OutboundOrderQueue } from "@/components/wms/OutboundOrderQueue";
import { ValidatorWorkstationSessionBar } from "@/components/wms/ValidatorWorkstationSessionBar";
import { ValidateOrderSummary } from "@/components/wms/ValidateOrderSummary";
import { BISNIS_COLLECTIONS, type SalesOrder, type SalesOrderLine } from "@/lib/bisnis/types";
import { loadValidateQueue, isSoAwaitingValidation } from "@/lib/wms/outbound-queues";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  isValidateComplete,
} from "@/lib/wms/outbound-workflow";
import { mergeOutboundLinesFromSoExpanded } from "@/lib/wms/outbound-bundle-expand";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { validateBarcodeScan } from "@/lib/wms/validations";
import { getErrorMessage } from "@/lib/errors";
import { findSalesOrderByScanRef, orderMatchesScanRef } from "@/lib/wms/outbound-order-lookup";
import { getPackageIdentityView } from "@/lib/wms/package-identity";
import { fetchWarehouseSlotAssignments } from "@/lib/inventory/client";
import { buildWmsLineViewsFromPickLines } from "@/lib/wms/wms-order-display";
import { INV_COLLECTIONS, type InvLocation, type InvProduct } from "@/lib/inventory/types";
import {
  buildValidateOrderContext,
  hydrateSalesOrderDisplay,
} from "@/lib/wms/validate-order-context";
import {
  ensureValidatePackSession,
  validationProgress,
} from "@/lib/wms/validate-pack-session";
import type { WmsWorkstation } from "@/lib/wms/workstations";
import { assertSessionAllowsValidation } from "@/lib/wms/workstation-session";
import { WMS_PACK_PHOTO_MAX } from "@/lib/wms/wms-media-limits";
import { orderMatchesPkScan } from "@/lib/wms/pk-identity";
import type { WorkstationSessionDto } from "@/lib/wms/workstation-session-client";
import { useLocale } from "@/components/LocaleProvider";

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

export default function WmsValidasiPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [queue, setQueue] = useState<SalesOrder[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [workstation, setWorkstation] = useState<WmsWorkstation | null>(null);
  const [deskSession, setDeskSession] = useState<WorkstationSessionDto | null>(null);
  const [scanQueue, setScanQueue] = useState("");
  const [scanProduct, setScanProduct] = useState("");
  const [scanPackage, setScanPackage] = useState("");
  const [packageVerified, setPackageVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineViews, setLineViews] = useState<ReturnType<typeof buildWmsLineViewsFromPickLines>>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [packing, setPacking] = useState(emptyPacking());
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
  };

  const openOrder = useCallback(
    async (row: SalesOrder) => {
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
      } catch (e) {
        setError(getErrorMessage(e));
        return;
      }
      const ws = workstation;
      if (!ws) return;
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
      setLoading(true);
      try {
        const audit = validatorAudit();
        const sessionSo = await ensureValidatePackSession(row, audit);
        const soLines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
          filter: `sales_order = "${row.id}"`,
          expand: "product",
          requestKey: null,
        });
        let slots: Record<string, InvLocation> = {};
        if (row.warehouse) {
          const { byProductId } = await fetchWarehouseSlotAssignments(row.warehouse);
          slots = byProductId;
        }
        const wfBase = parseOutboundWorkflow(sessionSo.outbound_workflow_json);
        const wfExpanded = await mergeOutboundLinesFromSoExpanded(pb, wfBase, soLines);
        const wfJson = serializeOutboundWorkflow(wfExpanded);
        let displaySo = sessionSo;
        if (wfJson !== sessionSo.outbound_workflow_json) {
          displaySo = await pb.collection(BISNIS_COLLECTIONS.salesOrders).update<SalesOrder>(
            sessionSo.id,
            { outbound_workflow_json: wfJson },
          );
        }
        const pickLines = wfExpanded.pick?.lines ?? {};
        const componentIds = Object.keys(pickLines);
        const productExpand: Record<string, InvProduct> = {};
        if (componentIds.length > 0) {
          const filter = componentIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
          const products = await pb.collection(INV_COLLECTIONS.products).getFullList<InvProduct>({
            filter,
            requestKey: null,
          });
          for (const p of products) productExpand[p.id] = p;
        }
        setLineViews(buildWmsLineViewsFromPickLines(pickLines, slots, productExpand));
        const hydrated = await hydrateSalesOrderDisplay({
          ...displaySo,
          expand: row.expand ?? displaySo.expand,
        });
        setSo(hydrated);
        const wf = parseOutboundWorkflow(displaySo.outbound_workflow_json);
        const pkgCode = getPackageIdentityView(hydrated, wf).code;
        const pk = wf.validate_pack?.packing;
        if (pk) {
          setPacking({
            weight_kg: pk.weight_kg != null ? String(pk.weight_kg) : "",
            length_cm: pk.length_cm != null ? String(pk.length_cm) : "",
            width_cm: pk.width_cm != null ? String(pk.width_cm) : "",
            height_cm: pk.height_cm != null ? String(pk.height_cm) : "",
            colli_count: pk.colli_count != null ? String(pk.colli_count) : "1",
          });
        } else {
          setPacking(emptyPacking());
        }
        setUploadedPhotoIds(wf.validate_pack?.pack_photo_ids ?? []);
        const pkgOk = !!wf.validate_pack?.package_code_verified;
        setPackageVerified(pkgOk);
        setScanPackage(pkgOk && pkgCode !== "—" ? pkgCode : "");
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [validatorAudit, workstation, deskSession, t],
  );

  const loadByRef = useCallback(
    async (code: string) => {
      setLoading(true);
      setError("");
      try {
        const row = await findSalesOrderByScanRef(code, { onlyAwaitingValidation: true });
        if (!row) throw new Error(t("wms.validasi.errOrderNotFound"));
        await openOrder(row);
      } catch (e) {
        setSo(null);
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [openOrder, t],
  );

  const wf = so ? parseOutboundWorkflow(so.outbound_workflow_json) : null;
  const progress = useMemo(() => validationProgress(lineViews), [lineViews]);
  const allSkuValid = wf ? isValidateComplete(wf) : false;

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
    const ws = workstation;
    if (!ws || deskSession?.needsBind) {
      setError(t("wms.validasi.errScanDesk"));
      return;
    }
    try {
      const product = await validateBarcodeScan(scanProduct);
      const key = product.id;
      const line = wf.pick?.lines?.[key];
      if (!line) {
        setError(t("wms.validasi.errSkuNotInOrder", { sku: product.sku }));
        return;
      }
      const nextValidated = line.qty_validated + 1;
      if (nextValidated > line.qty_required) {
        setError(t("wms.validasi.errQtyExceeded"));
        return;
      }
      const audit = validatorAudit();
      const nextWf = {
        ...wf,
        validate_pack: {
          ...wf.validate_pack,
          user_id: audit.userId,
          user_name: audit.userName,
          user_role: audit.userRole,
          started_at: wf.validate_pack?.started_at ?? new Date().toISOString(),
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
      setScanProduct("");
      setError("");
    } catch (e) {
      setError(getErrorMessage(e));
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

  const finishValidate = useCallback(async (photoIdsOverride?: string[]) => {
    if (!so || !wf) return;
    const ws = workstation;
    if (!ws || deskSession?.needsBind) {
      setError(t("wms.validasi.errScanDesk"));
      return;
    }
    if (!allSkuValid) {
      setError(t("wms.permintaan.errAllValid"));
      return;
    }
    if (!packageVerified) {
      setError(t("wms.validasi.errScanPackageFirst"));
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
      await refreshQueue();
      router.push(PERMINTAAN_BARANG.pickup);
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
    allSkuValid,
    packageVerified,
    uploadedPhotoIds,
    validatorAudit,
    packing,
    refreshQueue,
    router,
    t,
  ]);

  const handlePackPhotoCapture = useCallback(
    async (file: File) => {
      if (!so || !wf) return;
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
        const ready =
          isValidateComplete(wf) &&
          packageVerified &&
          nextPhotoIds.length > 0 &&
          sessionOk;

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
      packageVerified,
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
      if (action === "return_to_picking") router.push(PERMINTAAN_BARANG.picking);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const photoReady = uploadedPhotoIds.length > 0;
  const sessionReady = !!workstation && !!deskSession && !deskSession?.needsBind;

  const completionBlockers = useMemo(() => {
    const items: string[] = [];
    if (!allSkuValid) items.push(t("wms.validasi.blockerAllSku"));
    if (!packageVerified) items.push(t("wms.validasi.blockerPk"));
    if (!photoReady) items.push(t("wms.validasi.blockerPhoto"));
    if (!sessionReady) items.push(t("wms.validasi.blockerSession"));
    return items;
  }, [allSkuValid, packageVerified, photoReady, sessionReady, t]);

  const canComplete = completionBlockers.length === 0;

  const orderCtx = so ? buildValidateOrderContext(so) : null;
  const stage = wf?.stage ?? "validate_pack";

  return (
    <>
        <OutboundFlowBar stage={stage} />
        <ValidatorWorkstationSessionBar
          onWorkstationChange={setWorkstation}
          onSessionChange={setDeskSession}
        />

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-3">
            <OutboundOrderQueue
              title={t("wms.permintaan.queue")}
              subtitle={t("wms.validasi.queueSubtitle")}
              orders={queue}
              selectedId={so?.id}
              loading={queueLoading}
              emptyText={t("wms.validasi.queueEmpty")}
              onSelect={(o) => {
                if (!workstation || deskSession?.needsBind) {
                  setError(t("wms.permintaan.errScanValidator"));
                  return;
                }
                void openOrder(o);
              }}
            />
            <WmsCard>
              <WmsSectionTitle title={t("wms.permintaan.openOrder")} subtitle={t("wms.validasi.openOrderSubtitle")} />
              <div className="mt-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder={t("wms.validasi.scanPkPlaceholder")}
                  value={scanQueue}
                  onChange={(e) => setScanQueue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!workstation || deskSession?.needsBind) {
                        setError(t("wms.permintaan.errScanValidator"));
                        return;
                      }
                      void loadByRef(scanQueue);
                    }
                  }}
                />
                <WmsPrimaryButton type="button" disabled={loading} onClick={() => void loadByRef(scanQueue)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                </WmsPrimaryButton>
              </div>
            </WmsCard>
          </div>

          <div className="space-y-4 lg:col-span-9">
            {!so || !orderCtx ? (
              <WmsCard className="py-16 text-center text-sm text-slate-500">
                {t("wms.validasi.selectOrScan")}
              </WmsCard>
            ) : (
              <>
                <ValidateOrderSummary ctx={orderCtx} />

                <WmsCard className="border-emerald-200 bg-emerald-50/30">
                  <WmsSectionTitle title={t("wms.validasi.awbTitle")} subtitle={t("wms.validasi.awbSubtitle")} />
                  <div className="mt-2 space-y-3">
                    <AwbLabelPrintActions so={so} />
                    <InvoicePackQrPanel salesOrderId={so.id} />
                  </div>
                </WmsCard>

                <WmsCard className="border-2 border-indigo-200">
                  <WmsSectionTitle title={t("wms.validasi.scanProduct")} subtitle={t("wms.validasi.scanProductSubtitle")} />
                  <div className="mt-3 flex gap-2">
                    <input
                      autoFocus
                      className="flex-1 rounded-xl border-2 border-indigo-200 px-4 py-4 font-mono text-lg"
                      placeholder={t("wms.validasi.scanProductPlaceholder")}
                      value={scanProduct}
                      onChange={(e) => setScanProduct(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleProductScan()}
                    />
                    <WmsPrimaryButton type="button" onClick={() => void handleProductScan()}>
                      <Scan className="h-5 w-5" />
                    </WmsPrimaryButton>
                  </div>
                </WmsCard>

                <WmsCard>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <th className="px-3 py-2">{t("wms.hub.colSku")}</th>
                          <th className="px-3 py-2">{t("wms.validasi.colProductName")}</th>
                          <th className="px-3 py-2">{t("wms.validasi.colVariant")}</th>
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
                              <td className="px-3 py-2 text-slate-600">{l.variant ?? "—"}</td>
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
                                  {valid ? t("wms.validasi.statusValid") : t("wms.validasi.statusNotValid")}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">{t("wms.validasi.progressTitle")}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {t("wms.validasi.progressSummary", {
                        total: progress.totalSku,
                        valid: progress.validSku,
                        pending: progress.pendingSku,
                      })}
                    </p>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-xs font-bold text-emerald-700">{progress.pct}%</p>
                  </div>
                </WmsCard>

                {allSkuValid ? (
                  <>
                    <WmsCard className="border-violet-200 bg-violet-50/40">
                      <WmsSectionTitle title={t("wms.validasi.packing")} subtitle={t("wms.validasi.packingSubtitle")} />
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {(
                          [
                            ["weight_kg", t("wms.validasi.weightKg")],
                            ["length_cm", t("wms.validasi.lengthCm")],
                            ["width_cm", t("wms.validasi.widthCm")],
                            ["height_cm", t("wms.validasi.heightCm")],
                            ["colli_count", t("wms.validasi.colliCount")],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="block text-xs font-medium text-slate-700">
                            {label}
                            <input
                              type="number"
                              min={0}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              value={packing[key]}
                              onChange={(e) => setPacking((p) => ({ ...p, [key]: e.target.value }))}
                            />
                          </label>
                        ))}
                      </div>
                    </WmsCard>

                    <WmsCard className="border-cyan-200 bg-cyan-50/50">
                      <WmsSectionTitle
                        title={t("wms.validasi.scanPkTitle")}
                        subtitle={t("wms.validasi.scanPkSubtitle")}
                      />
                      <div className="mt-2 flex gap-2">
                        <input
                          className={
                            "flex-1 rounded-xl border-2 px-4 py-3 font-mono text-sm " +
                            (packageVerified ? "border-emerald-400 bg-emerald-50" : "border-cyan-200 bg-white")
                          }
                          placeholder={orderCtx.packageCode}
                          value={scanPackage}
                          onChange={(e) => {
                            setScanPackage(e.target.value);
                            setPackageVerified(false);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && void verifyPackageScan()}
                        />
                        <WmsPrimaryButton type="button" onClick={() => void verifyPackageScan()}>
                          <Scan className="h-4 w-4" />
                        </WmsPrimaryButton>
                      </div>
                      {packageVerified ? (
                        <p className="mt-2 flex items-center gap-1 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          {t("wms.validasi.pkVerified")}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-cyan-900">{t("wms.validasi.pkNotVerified")}</p>
                      )}
                    </WmsCard>

                    <WmsCard className="border-violet-300 bg-violet-50/60">
                      <ValidatePackPhotoCapture
                        uploadedCount={uploadedPhotoIds.length}
                        uploading={photoUploading}
                        onCapture={handlePackPhotoCapture}
                        onRemoveUploaded={() => {
                          setUploadedPhotoIds([]);
                          autoFinishForSoRef.current = null;
                        }}
                      />
                      {saving ? (
                        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-indigo-800">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t("wms.validasi.finishing")}
                        </p>
                      ) : canComplete && photoReady ? (
                        <p className="mt-3 text-xs text-emerald-800">
                          {t("wms.validasi.autoFinishHint")}
                        </p>
                      ) : null}
                    </WmsCard>
                  </>
                ) : null}

                {completionBlockers.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold">{t("wms.validasi.cannotComplete")}</p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {completionBlockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : saving ? (
                  <p className="text-sm font-medium text-indigo-800">{t("wms.validasi.autoFinishing")}</p>
                ) : (
                  <p className="text-sm font-medium text-emerald-700">
                    {t("wms.validasi.completeReady")}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-50"
                    onClick={() => {
                      if (window.confirm(t("wms.permintaan.confirmReturnPicking"))) {
                        void runWarehouseAction("return_to_picking");
                      }
                    }}
                  >
                    {t("wms.validasi.returnPicking")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-50"
                    onClick={() => {
                      const reason = window.prompt(t("wms.validasi.promptValidationFailed"));
                      if (reason !== null) void runWarehouseAction("validation_failed", reason);
                    }}
                  >
                    {t("wms.validasi.validationFailed")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
                    onClick={() => {
                      const reason = window.prompt(t("wms.validasi.promptCancel"));
                      if (reason !== null) void runWarehouseAction("cancel_order", reason);
                    }}
                  >
                    {t("wms.validasi.cancelOrder")}
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
              </>
            )}
          </div>
        </div>

    </>
  );
}
