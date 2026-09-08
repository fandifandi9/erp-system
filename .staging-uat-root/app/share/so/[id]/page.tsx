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

type ShareSo = {
  order_no: string;
  order_date: string;
  total: number;
  customer_name: string;
  store?: { name: string; phone?: string; email?: string } | null;
};

export default function PublicSalesOrderSharePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const showPreview = searchParams.get("view") === "1";

  const [data, setData] = useState<ShareSo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/bisnis/share/sales-order/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Gagal memuat");
        setData(j);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Gagal memuat"))
      .finally(() => setLoading(false));
  }, [id]);

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
        {error ?? "Dokumen tidak ditemukan"}
      </div>
    );
  }

  const publicPath =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/so/${id}`
      : `/share/so/${id}`;

  if (!showPreview) {
    return (
      <ShareOpenGate
        docLabel="Sales Order"
        docNo={data.order_no}
        partyLabel="Pelanggan"
        partyName={data.customer_name}
        previewHref={sharePreviewUrl(publicPath)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-indigo-50/80 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            Sales Order
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{data.store?.name ?? "SERBA"}</h1>
        </div>
        <div className="space-y-4 px-6 py-6 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">No. order</span>
            <span className="font-mono font-semibold">{data.order_no}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Pelanggan</span>
            <span className="font-medium">{data.customer_name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Tanggal</span>
            <span>{bizDocFmtDateShort(data.order_date)}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
            <span className="text-slate-500">Total</span>
            <span className="font-bold">{fmt(data.total)}</span>
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">
        <Link href="/login" className="text-indigo-600 hover:underline">
          SERBA System
        </Link>
      </p>
    </div>
  );
}
