"use client";

import { useMemo } from "react";
import { Copy, Printer } from "lucide-react";
import { printZoneQrLabel } from "@/lib/inventory/print-zone-qr";
import type { ZoneQrPrintMeta } from "@/lib/inventory/types";

export function ZoneQrDisplay({
  payload,
  label,
  size = 160,
  printMeta,
}: {
  payload: string;
  label?: string;
  size?: number;
  printMeta?: ZoneQrPrintMeta;
}) {
  const imgUrl = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`,
    [payload, size]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      /* ignore */
    }
  };

  const printLabel = () => {
    if (printMeta) {
      printZoneQrLabel(printMeta);
      return;
    }
    printZoneQrLabel({
      payload,
      zoneCode: label || "ZONA",
      zoneName: label || "Zona kerja",
    });
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl} alt={label || "QR zona"} width={size} height={size} className="rounded" />
      {label ? <p className="text-xs font-medium text-slate-700">{label}</p> : null}
      <p className="max-w-[220px] break-all text-center font-mono text-[10px] text-slate-500">{payload}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          <Copy className="h-3 w-3" /> Salin
        </button>
        <button
          type="button"
          onClick={printLabel}
          className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700"
        >
          <Printer className="h-3 w-3" /> Cetak QR
        </button>
      </div>
    </div>
  );
}
