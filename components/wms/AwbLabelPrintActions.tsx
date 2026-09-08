"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import {
  fetchAwbLabelInfo,
  regenerateAwbLabel,
  type AwbLabelInfo,
} from "@/lib/bisnis/awb-label-client";
import { printAwbLabelSmart } from "@/lib/wms/print-pack-labels";
import type { SalesOrder } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";
import { getAwbTrackingFromOrder } from "@/lib/bisnis/awb-label";
import { extractAwbFromOrder } from "@/lib/wms/package-identity";

type Props = {
  so: SalesOrder;
  /** Jika true, hanya tampil status siap (tanpa tombol generate ulang yang lambat). */
  compact?: boolean;
};

function hasRealAwb(so: SalesOrder): boolean {
  return !!(extractAwbFromOrder(so)?.trim() || getAwbTrackingFromOrder(so));
}

/**
 * Packing: hanya baca label yang sudah dibuat di picking ACC.
 * Tidak auto-regenerate saat modal dibuka (penyebab crash/lemot).
 */
export function AwbLabelPrintActions({ so, compact }: Props) {
  const { t } = useLocale();
  const [info, setInfo] = useState<AwbLabelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (isWmsPickupFulfillment(so)) {
          if (!cancelled) {
            setInfo(null);
            setError(t("wms.validasi.awbNotForPickup"));
          }
          return;
        }
        if (!hasRealAwb(so)) {
          if (!cancelled) {
            setInfo(null);
            setError(t("wms.validasi.awbNeedTracking"));
          }
          return;
        }
        // Hanya GET — file harus sudah ada dari picking.
        const existing = await fetchAwbLabelInfo(so.id);
        if (!cancelled) {
          setInfo(existing.has_file ? existing : null);
          if (!existing.has_file) {
            setError(t("wms.validasi.awbMissingFromPick"));
          }
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [so, t]);

  const printNow = async () => {
    if (!info?.has_file || !info.url) return;
    setPrinting(true);
    setError("");
    try {
      await printAwbLabelSmart(so.id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPrinting(false);
    }
  };

  const regen = async () => {
    setRegenBusy(true);
    setError("");
    try {
      const data = await regenerateAwbLabel(so.id);
      setInfo(data);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRegenBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("wms.validasi.awbLoading")}
      </p>
    );
  }

  if (error && !info?.has_file) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <p className="font-semibold">{error}</p>
        {hasRealAwb(so) && !isWmsPickupFulfillment(so) ? (
          <button
            type="button"
            disabled={regenBusy}
            onClick={() => void regen()}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {regenBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("wms.validasi.awbRegenBtn")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!info?.has_file || !info.url) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        <p className="font-semibold">{t("wms.validasi.awbNeedTracking")}</p>
      </div>
    );
  }

  const tracking = info.tracking_no?.trim() || "";

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs"
          : "rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm"
      }
    >
      <p className="font-semibold text-emerald-950">{t("wms.validasi.awbReady")}</p>
      {tracking ? (
        <p className="mt-0.5 font-mono text-xs text-emerald-800">
          {t("wms.validasi.awbTracking", { tracking })}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
        >
          <FileText className="h-3.5 w-3.5" />
          {t("wms.validasi.awbViewPdf")}
        </a>
        <button
          type="button"
          disabled={printing}
          onClick={() => void printNow()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {t("wms.validasi.awbPrint")}
        </button>
        {!compact ? (
          <button
            type="button"
            disabled={regenBusy}
            onClick={() => void regen()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title={t("wms.validasi.awbRegenBtn")}
          >
            {regenBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("wms.validasi.awbRegenShort")}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
