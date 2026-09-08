"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

export function EvidenceCameraModal({ open, onClose, onCapture }: Props) {
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setError(null);
      setBusy(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("hr.reporting.cameraUnsupported"));
        return;
      }

      setBusy(true);
      setError(null);
      stopStream();

      const constraints: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: true, audio: false },
      ];

      for (const constraint of constraints) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraint);
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            await video.play().catch(() => undefined);
          }
          setBusy(false);
          return;
        } catch {
          /* try next constraint */
        }
      }

      if (!cancelled) {
        setBusy(false);
        setError(t("hr.reporting.cameraDenied"));
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream, t]);

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 1 || busy) return;

    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("hr.reporting.errors.upload"));

      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88);
      });
      if (!blob) throw new Error(t("hr.reporting.errors.upload"));

      const file = new File([blob], `evidence-${Date.now()}.jpg`, { type: "image/jpeg" });
      await onCapture(file);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("hr.reporting.errors.upload"));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{t("hr.reporting.takePhoto")}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            aria-label={t("common.cancel")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-black">
          <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
          ) : null}
        </div>

        <p className="px-4 py-2 text-xs text-slate-500">{t("hr.reporting.takePhotoHint")}</p>
        {error ? <p className="px-4 pb-2 text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || Boolean(error)}
            onClick={() => void handleCapture()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {t("hr.reporting.cameraCapture")}
          </button>
        </div>
      </div>
    </div>
  );
}
