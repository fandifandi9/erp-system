"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Printer, QrCode } from "lucide-react";

type InvoiceQrData = {
  ok: boolean;
  reason?: string;
  invoice_no?: string;
  public_url?: string;
  qr_payload?: string;
};

/** QR invoice aman untuk ditempel dalam paket — hanya tampil jika invoice sudah ada. */
export function InvoicePackQrPanel({ salesOrderId }: { salesOrderId: string }) {
  const [data, setData] = useState<InvoiceQrData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/invoice-qr`, {
        credentials: "include",
      });
      const json = (await res.json()) as InvoiceQrData & { error?: string };
      if (!res.ok) {
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data?.ok) return null;

  const payload = data.qr_payload ?? data.public_url ?? "";
  const labelUrl = `/wms/barcode?pkg=${encodeURIComponent(payload)}&order=${encodeURIComponent(data.invoice_no ?? "Invoice")}&sym=qr`;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm">
      <p className="font-semibold text-emerald-950">QR Invoice (dalam paket)</p>
      <p className="mt-1 font-mono text-base font-bold text-indigo-900">{data.invoice_no}</p>
      <p className="text-xs text-emerald-800">
        Pelanggan scan untuk buka invoice — link aman, bukan ID internal.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={labelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
        >
          <Printer className="h-3.5 w-3.5" />
          Cetak QR Invoice
        </Link>
        <span className="inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-600">
          <QrCode className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-mono">{payload}</span>
        </span>
      </div>
    </div>
  );
}
