"use client";

import { useEffect } from "react";
import { Printer, X, Loader2 } from "lucide-react";
import type { PosReceiptData } from "@/lib/pos/receipt";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";
import { PosPickupPrint } from "@/components/pos/PosPickupPrint";
import { PosBigButton } from "@/components/pos/PosShell";

type Props = {
  open: boolean;
  loading: boolean;
  data: PosReceiptData | null;
  onClose: () => void;
  autoPrint?: boolean;
};

export function PosReprintModal({ open, loading, data, onClose, autoPrint = false }: Props) {
  useEffect(() => {
    if (!open || !data || loading || !autoPrint) return;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [open, data, loading, autoPrint]);

  if (!open) return null;

  const isWms = data?.mode === "wms";
  const printDoc = () => {
    try {
      window.print();
    } catch {
      /* */
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-6 print:hidden">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-bold text-slate-900">
              {isWms ? "Preview label pickup" : "Preview struk"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : data ? (
              <>
                {isWms ? <PosPickupPrint data={data} /> : <PosReceiptPrint data={data} />}
                <p className="mt-3 text-center text-xs text-slate-500">
                  Hanya preview & cetak ulang. Edit/hapus lewat menu Penjualan di ERP.
                </p>
                <div className="mt-4 grid gap-2">
                  <PosBigButton onClick={printDoc}>
                    <span className="inline-flex items-center justify-center gap-2">
                      <Printer className="h-5 w-5" />
                      {isWms ? "Cetak label pickup" : "Cetak struk"}
                    </span>
                  </PosBigButton>
                  <PosBigButton variant="secondary" onClick={onClose}>
                    Tutup
                  </PosBigButton>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-red-600">Gagal memuat data cetak</p>
            )}
          </div>
        </div>
      </div>

      {data && (
        <div className="hidden print:block">
          {isWms ? <PosPickupPrint data={data} /> : <PosReceiptPrint data={data} />}
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 4mm;
          }
          body {
            background: white !important;
          }
          .pos-app-header,
          .pos-page-heading,
          header,
          .print\\:hidden {
            display: none !important;
          }
          main {
            background: white !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          .receipt-print,
          .receipt-print *,
          .pickup-print,
          .pickup-print * {
            visibility: visible;
          }
          .receipt-print,
          .pickup-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 !important;
            padding: 2mm !important;
          }
        }
      `}</style>
    </>
  );
}
