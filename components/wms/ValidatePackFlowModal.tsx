"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Printer } from "lucide-react";
import type { SalesOrder } from "@/lib/bisnis/types";
import { AwbLabelPrintActions } from "@/components/wms/AwbLabelPrintActions";
import { PkLabelPrintActions } from "@/components/wms/PkLabelPrintActions";
import { ValidatePackPhotoCapture } from "@/components/wms/ValidatePackPhotoCapture";
import { useLocale } from "@/components/LocaleProvider";
import { WMS_PACK_PHOTO_MAX } from "@/lib/wms/wms-media-limits";
import type { WmsFulfillmentMode } from "@/lib/wms/fulfillment-mode";

export type ValidatePackFlowStep = "awb" | "photo";

type Props = {
  open: boolean;
  step: ValidatePackFlowStep;
  so: SalesOrder;
  fulfillmentMode?: WmsFulfillmentMode;
  uploadedPhotoCount: number;
  photoUploading: boolean;
  saving: boolean;
  onAwbConfirm: () => void;
  onPhotoCapture: (file: File) => void | Promise<void>;
  onPhotoFinish: () => void;
  onPhotoRemove: () => void;
  onBackToQueue?: () => void;
  onCancelOrder?: () => void;
};

export function ValidatePackFlowModal({
  open,
  step,
  so,
  fulfillmentMode = "ship",
  uploadedPhotoCount,
  photoUploading,
  saving,
  onAwbConfirm,
  onPhotoCapture,
  onPhotoFinish,
  onPhotoRemove,
  onBackToQueue,
  onCancelOrder,
}: Props) {
  const { t } = useLocale();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const atMax = uploadedPhotoCount >= WMS_PACK_PHOTO_MAX;
  const canManualFinish = uploadedPhotoCount >= 1 && !atMax && !photoUploading && !saving;
  const isPickup = fulfillmentMode === "pickup";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      if (step === "awb" && !saving) {
        e.preventDefault();
        onAwbConfirm();
      }
      if (step === "photo" && canManualFinish) {
        e.preventDefault();
        onPhotoFinish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, saving, canManualFinish, onAwbConfirm, onPhotoFinish]);

  useEffect(() => {
    if (!open || step !== "awb") return;
    confirmRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="validate-pack-flow-title"
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">
            {step === "awb"
              ? isPickup
                ? t("wms.validasi.guideStep3PkLabel")
                : t("wms.validasi.guideStep3Label")
              : t("wms.validasi.guideStep3Photo")}
          </p>
          <h2 id="validate-pack-flow-title" className="mt-1 text-lg font-bold text-slate-900">
            {step === "awb"
              ? isPickup
                ? t("wms.validasi.pkModalTitle")
                : t("wms.validasi.awbModalTitle")
              : t("wms.validasi.photoModalTitle")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {step === "awb"
              ? isPickup
                ? t("wms.validasi.pkModalHint")
                : t("wms.validasi.awbModalHint")
              : t("wms.validasi.photoModalHint")}
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          {step === "awb" ? (
            <>
              {isPickup ? <PkLabelPrintActions so={so} /> : <AwbLabelPrintActions so={so} />}
              <p className="text-xs text-slate-500">
                {isPickup ? t("wms.validasi.pkPackWhileOpen") : t("wms.validasi.awbPackWhileOpen")}
              </p>
              <button
                ref={confirmRef}
                type="button"
                disabled={saving}
                onClick={onAwbConfirm}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                {isPickup ? t("wms.validasi.pkConfirmBtn") : t("wms.validasi.awbConfirmBtn")}
              </button>
              <p className="text-center text-[11px] text-slate-400">{t("wms.validasi.enterToConfirm")}</p>
            </>
          ) : (
            <>
              <ValidatePackPhotoCapture
                uploadedCount={uploadedPhotoCount}
                maxPhotos={WMS_PACK_PHOTO_MAX}
                uploading={photoUploading}
                onCapture={onPhotoCapture}
                onRemoveUploaded={onPhotoRemove}
              />
              {saving || (atMax && photoUploading) ? (
                <p className="flex items-center justify-center gap-2 text-sm text-indigo-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("wms.validasi.autoFinishing")}
                </p>
              ) : atMax ? (
                <p className="text-center text-sm font-medium text-emerald-700">
                  {t("wms.validasi.photoSavedAuto")}
                </p>
              ) : (
                <button
                  type="button"
                  disabled={!canManualFinish}
                  onClick={onPhotoFinish}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("wms.validasi.photoFinishBtn", { count: uploadedPhotoCount })}
                </button>
              )}
              {(onBackToQueue || onCancelOrder) && step === "photo" ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {onBackToQueue ? (
                    <button
                      type="button"
                      onClick={onBackToQueue}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      {t("wms.validasi.backToQueue")}
                    </button>
                  ) : null}
                  {onCancelOrder ? (
                    <button
                      type="button"
                      onClick={onCancelOrder}
                      className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                    >
                      {t("wms.validasi.cancelOrder")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
