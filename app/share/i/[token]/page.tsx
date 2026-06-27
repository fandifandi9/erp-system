"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ShareOpenGate } from "@/components/share/ShareOpenGate";
import { bizDocFmtDateShort } from "@/lib/bisnis/doc-print-format";
import { sharePreviewUrl } from "@/lib/bisnis/doc-share";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

type ShareInvoice = {
  invoice_no: string;
  issue_date: string;
  due_date: string;
  total: number;
  remaining: number;
  status: string;
  customer_name: string;
  store?: { name: string; phone?: string; email?: string; address?: string } | null;
};

export default function PublicInvoiceTokenSharePage() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const showPreview = searchParams.get("view") === "1";

  const [data, setData] = useState<ShareInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/bisnis/share/invoice/token/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Gagal memuat");
        setData(j);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Gagal memuat"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-red-600">
        {error ?? "Invoice tidak ditemukan"}
      </div>
    );
  }

  const publicPath = `/share/i/${encodeURIComponent(token)}`;
  const publicUrl =
    typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

  if (!showPreview) {
    return (
      <ShareOpenGate
        docLabel="Invoice penjualan"
        docNo={data.invoice_no}
        partyLabel="Pelanggan"
        partyName={data.customer_name}
        previewHref={sharePreviewUrl(publicUrl)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Invoice</p>
        <h1 className="mt-1 font-mono text-2xl font-bold text-slate-900">{data.invoice_no}</h1>
        <p className="mt-2 text-sm text-slate-600">{data.customer_name}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Tanggal</dt>
            <dd>{bizDocFmtDateShort(data.issue_date)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Jatuh tempo</dt>
            <dd>{bizDocFmtDateShort(data.due_date)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd>{fmt(data.total)}</dd>
          </div>
          {data.remaining > 0 ? (
            <div className="flex justify-between text-amber-800">
              <dt>Sisa tagihan</dt>
              <dd>{fmt(data.remaining)}</dd>
            </div>
          ) : null}
        </dl>
        {data.store ? (
          <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <p className="font-medium text-slate-700">{data.store.name}</p>
            {data.store.address ? <p>{data.store.address}</p> : null}
            {data.store.phone ? <p>{data.store.phone}</p> : null}
          </div>
        ) : null}
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href={publicPath} className="text-indigo-600 hover:underline">
            Kembali
          </Link>
        </p>
      </div>
    </div>
  );
}
