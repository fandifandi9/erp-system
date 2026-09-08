"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

/** Kamera depan tablet — countdown lalu capture otomatis saat PK ditemukan. */
export function DeskAutoPhotoCapture({
  active,
  onCaptured,
  onCleared,
  previewUrl,
}: {
  active: boolean;
  onCaptured: (file: File) => void;
  onCleared?: () => void;
  previewUrl?: string | null;
}) {
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const runIdRef = useRef(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const captureFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 1) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `desk-${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85,
      );
    });
  }, []);

  const startAndCapture = useCallback(async () => {
    if (busyRef.current || previewUrl) return;
    const runId = ++runIdRef.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setCountdown(null);
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      for (let n = 3; n >= 1; n--) {
        if (runId !== runIdRef.current) return;
        setCountdown(n);
        await new Promise((r) => setTimeout(r, 700));
      }
      if (runId !== runIdRef.current) return;
      setCountdown(0);
      const file = await captureFrame();
      if (!file) throw new Error(t("wms.desk.errCameraCapture"));
      if (runId !== runIdRef.current) return;
      onCaptured(file);
      stopStream();
      setCountdown(null);
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setError(e instanceof Error ? e.message : t("wms.desk.errCamera"));
      stopStream();
      setCountdown(null);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [captureFrame, onCaptured, previewUrl, stopStream, t]);

  useEffect(() => {
    if (!active) {
      runIdRef.current += 1;
      busyRef.current = false;
      setBusy(false);
      stopStream();
      setCountdown(null);
      return;
    }
    if (previewUrl) {
      // Sudah ada foto — jangan restart kamera.
      runIdRef.current += 1;
      busyRef.current = false;
      setBusy(false);
      stopStream();
      setCountdown(null);
      return;
    }
    void startAndCapture();
    return () => {
      runIdRef.current += 1;
      busyRef.current = false;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, previewUrl]);

  useEffect(() => () => stopStream(), [stopStream]);

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-indigo-200 bg-slate-900">
      <div className="relative aspect-[4/3] w-full bg-black">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full scale-x-[-1] object-cover"
          />
        )}
        {countdown !== null && countdown > 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-7xl font-bold text-white drop-shadow">{countdown}</span>
          </div>
        ) : null}
        {busy && countdown === null && !previewUrl ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-10 w-10 animate-spin text-white" />
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 bg-indigo-950 px-3 py-2 text-indigo-100">
        <p className="flex items-center gap-2 text-xs">
          <Camera className="h-4 w-4" />
          {previewUrl ? t("wms.desk.photoReady") : t("wms.desk.photoHint")}
        </p>
        {previewUrl || error ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
            onClick={() => {
              onCleared?.();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("wms.desk.retake")}
          </button>
        ) : null}
      </div>
      {error ? <p className="bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
