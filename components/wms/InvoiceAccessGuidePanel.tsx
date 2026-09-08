"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { printInvoiceAccessSlipSmart } from "@/lib/wms/print-invoice-access-slip";
import { useLocale } from "@/components/LocaleProvider";
import { getErrorMessage } from "@/lib/errors";

type InvoiceQrPayload = {
  ok: boolean;
  reason?: string;
  invoice_no?: string;
  public_url?: string;
  qr_payload?: string;
  order_no?: string;
  store_name?: string | null;
  packing_list?: { sku: string; name: string; qty: number }[];
};

type Props = {
  salesOrderId: string;
  orderNo?: string;
  refreshKey?: string;
  confirmed: boolean;
  onConfirmed: () => void;
  /** @deprecated Cetak sukses selalu membuka scan; prop diabaikan. */
  requirePrintBeforeConfirm?: boolean;
};

/** Strip kompak langkah 1 — cetak QR, lalu otomatis lanjut scan produk. */
export function InvoiceAccessGuidePanel({
  salesOrderId,
  orderNo,
  refreshKey,
  confirmed,
  onConfirmed,
}: Props) {
  const { t } = useLocale();
  const [data, setData] = useState<InvoiceQrPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/invoice-qr`, {
        credentials: "include",
      });
      const json = (await res.json()) as InvoiceQrPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || t("wms.validasi.errInvoiceQrLoad"));
      setData(json);
      if (!json.ok) {
        setError(
          json.reason === "no_invoice"
            ? t("wms.validasi.errInvoiceNotReady")
            : t("wms.validasi.errInvoiceQrLoad"),
        );
      }
    } catch (e) {
      setData(null);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [salesOrderId, t]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const printSlip = async () => {
    if (!data?.ok || !data.invoice_no) return;
    const url = (data.public_url || data.qr_payload || "").trim();
    if (!url) {
      setError(t("wms.validasi.errInvoiceQrLoad"));
      return;
    }
    setPrinting(true);
    setError("");
    try {
      await printInvoiceAccessSlipSmart({
        invoiceNo: data.invoice_no,
        publicUrl: url,
        storeName: data.store_name || undefined,
        packingList: data.packing_list ?? [],
      });
      // Setelah cetak selesai → langsung buka scan produk.
      onConfirmed();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPrinting(false);
    }
  };

  if (confirmed) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("wms.validasi.guideQrLoading")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-slate-600">
          {t("wms.validasi.guideQrCompactLabel")}
          {data?.ok && data.invoice_no ? (
            <span className="ml-1 font-mono text-indigo-800">{data.invoice_no}</span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={printing || !data?.ok}
          onClick={() => void printSlip()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {t("wms.validasi.guidePrintQrBtn")}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{t("wms.validasi.guideQrCompactHint")}</p>
      {error ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[11px] font-semibold text-indigo-700 underline"
          >
            {t("wms.validasi.guideQrRetry")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
