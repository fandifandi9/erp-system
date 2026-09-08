"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { reportingAuthHeaders, reportingFetch } from "@/lib/hr/reporting-client";
import type { ReportingAttachmentMeta } from "@/lib/hr/reporting-types";

type Props = {
  attachment: ReportingAttachmentMeta;
  previewUrl?: string;
  onClose: () => void;
};

export function EvidenceViewer({ attachment, previewUrl, onClose }: Props) {
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
        const res = await reportingFetch(attachment.url, {
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
  }, [attachment.url, previewUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-900"
        aria-label={t("hr.reporting.closeViewer")}
      >
        <X className="h-5 w-5" />
      </button>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.original_name}
          className="max-h-[90vh] max-w-full object-contain"
        />
      ) : (
        <p className="text-sm text-white/80">
          {failed ? t("hr.reporting.errors.upload") : t("hr.common.saving")}
        </p>
      )}
    </div>
  );
}
