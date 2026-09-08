"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { WmsSectionTitle } from "@/components/wms/ui";
import { WMS_PACK_PHOTO_MAX } from "@/lib/wms/wms-media-limits";
import { useLocale } from "@/components/LocaleProvider";

type PreviewItem = { id: string; url: string; name: string };

export function ValidatePackPhotoCapture({
  autoOpenCamera = false,
  uploadedCount,
  uploading,
  onCapture,
  onRemoveUploaded,
  maxPhotos = WMS_PACK_PHOTO_MAX,
  title,
  subtitle,
}: {
  uploadedCount: number;
  uploading: boolean;
  onCapture: (file: File) => void | Promise<void>;
  onRemoveUploaded?: () => void;
  maxPhotos?: number;
  /** Buka kamera otomatis saat modal tampil (alur tanpa mouse). */
  autoOpenCamera?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const { t } = useLocale();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  const atMax = uploadedCount >= maxPhotos;

  useEffect(() => {
    if (!autoOpenCamera || uploading || atMax) return;
    const timer = window.setTimeout(() => cameraRef.current?.click(), 300);
    return () => window.clearTimeout(timer);
  }, [autoOpenCamera, uploading, atMax, uploadedCount]);

  useEffect(() => {
    return () => {
      for (const p of previewsRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  useEffect(() => {
    if (uploadedCount !== 0) return;
    setPreviews((prev) => {
      if (prev.length === 0) return prev;
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  }, [uploadedCount]);

  const handleFiles = (files: FileList | null) => {
    if (uploadedCount >= maxPhotos || uploading) return;
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const id = `${Date.now()}-${file.name}`;
    setPreviews((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [{ id, url, name: file.name }];
    });
    void onCapture(file);
  };

  return (
    <div>
      <WmsSectionTitle
        title={title ?? t("wms.photo.title")}
        subtitle={subtitle ?? t("wms.photo.subtitle", { max: maxPhotos })}
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={uploading || atMax}
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-indigo-300 bg-gradient-to-b from-indigo-50 to-white px-4 py-6 text-indigo-900 shadow-sm transition hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          ) : (
            <Camera className="h-10 w-10 text-indigo-600" strokeWidth={1.5} />
          )}
          <span className="text-sm font-bold">{t("wms.photo.takePhoto")}</span>
          <span className="text-[10px] text-indigo-700">{t("wms.photo.takePhotoHint")}</span>
        </button>

        <button
          type="button"
          disabled={uploading || atMax}
          onClick={() => galleryRef.current?.click()}
          className="flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-6 text-slate-800 transition hover:border-slate-300 hover:bg-white disabled:opacity-50"
        >
          <ImagePlus className="h-9 w-9 text-slate-500" strokeWidth={1.5} />
          <span className="text-sm font-semibold">{t("wms.photo.gallery")}</span>
          <span className="text-[10px] text-slate-500">{t("wms.photo.galleryHint")}</span>
        </button>
      </div>

      {/* Kamera: capture=environment → buka kamera (HP/tablet). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Galeri: tanpa capture → buka galeri / file picker. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {previews.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {previews.map((p) => (
            <li key={p.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-xs text-slate-600">
        {t("wms.photo.saved", { count: uploadedCount, max: maxPhotos })}
        {uploading ? (
          <span className="ml-2 text-indigo-600">{t("wms.photo.uploading")}</span>
        ) : uploadedCount >= 1 ? (
          <span className="ml-2 font-semibold text-emerald-700">{t("wms.photo.ready")}</span>
        ) : (
          <span className="ml-2 font-semibold text-amber-700">{t("wms.photo.minRequired")}</span>
        )}
      </p>

      {uploadedCount > 0 && onRemoveUploaded ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
          onClick={onRemoveUploaded}
        >
          <Trash2 className="h-3 w-3" />
          {t("wms.photo.removeSaved")}
        </button>
      ) : null}
    </div>
  );
}
