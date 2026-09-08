"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { compressEvidenceImage } from "@/lib/hr/compress-evidence-image";
import { reportingAuthHeaders, reportingFetch } from "@/lib/hr/reporting-client";
import type { ReportingAttachmentMeta } from "@/lib/hr/reporting-types";
import { REPORTING_MAX_ATTACHMENTS } from "@/lib/hr/reporting-types";
import { EvidenceViewer } from "@/components/hr/EvidenceViewer";
import { EvidenceCameraModal } from "@/components/hr/EvidenceCameraModal";

type Props = {
  kind: "report" | "finding";
  parentId: string | null;
  items: ReportingAttachmentMeta[];
  disabled?: boolean;
  onChange: (items: ReportingAttachmentMeta[]) => void;
  ensureDraft: () => Promise<string>;
};

function EvidenceThumbnail({
  att,
  previewUrl,
  onOpen,
}: {
  att: ReportingAttachmentMeta;
  previewUrl?: string;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const [src, setSrc] = useState<string | null>(previewUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl);
      setFailed(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const res = await reportingFetch(att.url, {
          credentials: "include",
          headers: reportingAuthHeaders(false),
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || ct.includes("application/json")) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setSrc(objectUrl);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att.url, previewUrl]);

  return (
    <button
      type="button"
      className="flex h-full w-full items-center justify-center bg-slate-100"
      onClick={onOpen}
      aria-label={t("hr.reporting.openEvidence")}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="px-2 text-center text-xs text-slate-500">
          {failed ? t("hr.reporting.errors.upload") : t("hr.common.saving")}
        </span>
      )}
    </button>
  );
}

export function EvidencePicker({ kind, parentId, items, disabled, onChange, ensureDraft }: Props) {
  const { t } = useLocale();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ReportingAttachmentMeta | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [cameraOpen, setCameraOpen] = useState(false);

  const base = kind === "finding" ? "/api/hr/findings" : "/api/hr/reports";
  const countLabel = t("hr.reporting.evidenceCount", {
    x: items.length,
    y: REPORTING_MAX_ATTACHMENTS,
  });

  const revokePreview = useCallback((id: string) => {
    setLocalPreviews((prev) => {
      const url = prev[id];
      if (url) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [localPreviews]);

  async function addFiles(list: FileList | File[] | null) {
    const files = list ? Array.from(list) : [];
    if (!files.length || disabled) return;
    setError(null);
    setBusy(true);
    try {
      const id = parentId || (await ensureDraft());
      const next = [...items];
      for (const raw of files) {
        if (next.length >= REPORTING_MAX_ATTACHMENTS) {
          setError(t("hr.reporting.errors.maxEvidence"));
          break;
        }
        const file = await compressEvidenceImage(raw);
        const previewUrl = URL.createObjectURL(file);
        const fd = new FormData();
        fd.append("file", file);
        const headers = reportingAuthHeaders(false);
        const res = await reportingFetch(`${base}/${id}/attachments`, {
          method: "POST",
          headers,
          body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          URL.revokeObjectURL(previewUrl);
          setError(String(json.error || t("hr.reporting.errors.upload")));
          break;
        }
        const meta = json.data as ReportingAttachmentMeta;
        setLocalPreviews((prev) => ({ ...prev, [meta.id]: previewUrl }));
        next.push(meta);
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("hr.reporting.offline"));
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  async function remove(att: ReportingAttachmentMeta) {
    if (!parentId || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await reportingFetch(`${base}/${parentId}/attachments/${att.id}`, {
        method: "DELETE",
        headers: reportingAuthHeaders(false),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error || t("hr.reporting.errors.upload")));
        return;
      }
      revokePreview(att.id);
      onChange(items.filter((x) => x.id !== att.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("hr.reporting.offline"));
    } finally {
      setBusy(false);
    }
  }

  function openCamera() {
    if (typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function") {
      setCameraOpen(true);
      return;
    }
    cameraRef.current?.click();
  }

  const canAdd = !disabled && items.length < REPORTING_MAX_ATTACHMENTS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{t("hr.reporting.evidence")}</p>
        <p className="text-sm text-slate-600">{countLabel}</p>
      </div>
      <p className="text-xs text-slate-500">{t("hr.reporting.evidenceHelp")}</p>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((att) => (
          <div key={att.id} className="relative aspect-square overflow-hidden rounded-lg border bg-slate-100">
            <EvidenceThumbnail
              att={att}
              previewUrl={localPreviews[att.id]}
              onOpen={() => setViewer(att)}
            />
            {!disabled ? (
              <button
                type="button"
                onClick={() => void remove(att)}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/80 text-white"
                aria-label={t("hr.reporting.removeEvidence")}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
        {canAdd ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white p-2 text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700 disabled:opacity-50"
            aria-label={t("hr.reporting.pickGallery")}
          >
            <span className="text-lg font-medium leading-none">+</span>
            <span className="text-[10px] font-medium">{t("hr.reporting.pickGallery")}</span>
          </button>
        ) : null}
      </div>

      {!disabled ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy || !canAdd}
            onClick={openCamera}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {t("hr.reporting.takePhoto")}
          </button>
          <button
            type="button"
            disabled={busy || !canAdd}
            onClick={() => galleryRef.current?.click()}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" />
            {t("hr.reporting.pickGallery")}
          </button>
        </div>
      ) : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => void addFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => void addFiles(e.target.files)}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {busy ? <p className="text-xs text-slate-500">{t("hr.common.saving")}</p> : null}

      {viewer ? (
        <EvidenceViewer
          attachment={viewer}
          previewUrl={localPreviews[viewer.id]}
          onClose={() => setViewer(null)}
        />
      ) : null}

      <EvidenceCameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={async (file) => {
          await addFiles([file]);
        }}
      />
    </div>
  );
}
