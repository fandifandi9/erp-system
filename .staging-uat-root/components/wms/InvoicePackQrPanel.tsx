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

/** QR invoice aman untuk ditempel dalam paket (Packing + QC). */
export function InvoicePackQrPanel({ salesOrderId }: { salesOrderId: string }) {
  const [data, setData] = useState<InvoiceQrData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/invoice-qr`, {
        credentials: "include",
      });
      const json = (await res.json()) as InvoiceQrData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Gagal memuat QR invoice");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat QR invoice");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat QR invoice…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data?.ok) {
    return (
      <p className="text-sm text-amber-800">
        Invoice belum dibuat untuk order ini — QR tersedia setelah invoice terbit di penjualan.
      </p>
    );
  }

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
