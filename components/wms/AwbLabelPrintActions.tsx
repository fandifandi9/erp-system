"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Printer } from "lucide-react";
import { fetchAwbLabelInfo, type AwbLabelInfo } from "@/lib/bisnis/awb-label-client";
import { getAwbTrackingFromOrder } from "@/lib/bisnis/awb-label";
import type { SalesOrder } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";

type Props = {
  so: SalesOrder;
};

export function AwbLabelPrintActions({ so }: Props) {
  const [info, setInfo] = useState<AwbLabelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAwbLabelInfo(so.id)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [so.id]);

  const tracking = getAwbTrackingFromOrder(so);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Memuat label AWB…
      </p>
    );
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  if (!info?.has_file || !info.url) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <p className="font-semibold">Label AWB belum diunggah</p>
        <p className="mt-0.5">
          {tracking
            ? `Resi tercatat: ${tracking} — unggah PDF di penjualan atau tunggu di Ready To Pickup.`
            : "Lanjutkan packing; tempel label saat resi tersedia."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
      <p className="font-semibold text-emerald-950">Label AWB siap cetak</p>
      {tracking ? (
        <p className="mt-0.5 font-mono text-xs text-emerald-800">Resi: {tracking}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
        >
          <FileText className="h-3.5 w-3.5" />
          Lihat PDF
        </a>
        <button
          type="button"
          onClick={() => {
            const w = window.open(info.url!, "_blank");
            w?.addEventListener("load", () => w.print());
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          <Printer className="h-3.5 w-3.5" />
          Cetak AWB
        </button>
      </div>
    </div>
  );
}
