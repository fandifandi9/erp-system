"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Printer, X } from "lucide-react";
import type { PosReceiptData } from "@/lib/pos/receipt";
import { PosPickupPrint } from "@/components/pos/PosPickupPrint";
import { PosBigButton } from "@/components/pos/PosShell";

type Props = {
  open: boolean;
  data: PosReceiptData | null;
  importBatchId?: string;
  onClose: () => void;
};

export function PosPickupModal({ open, data, importBatchId, onClose }: Props) {
  useEffect(() => {
    if (!open || !data?.pickupNo) return;
    const t = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        /* cetak dibatalkan */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [open, data?.pickupNo]);

  if (!open || !data) return null;

  const printDoc = () => {
    try {
      window.print();
    } catch {
      /* cetak dibatalkan */
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8 print:hidden">
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pickup-modal-title"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id="pickup-modal-title" className="text-lg font-bold text-slate-900">
              Nomor pickup
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
            <PosPickupPrint data={data} />
            <p className="mt-3 text-center text-xs text-slate-500">
              Pesanan tersimpan di WMS. Tempel label di paket.
            </p>
            <div className="mt-4 grid gap-2">
              <PosBigButton onClick={printDoc}>
                <span className="inline-flex items-center justify-center gap-2">
                  <Printer className="h-5 w-5" /> Cetak nomor pickup
                </span>
              </PosBigButton>
              <PosBigButton variant="secondary" onClick={onClose}>
                Transaksi baru
              </PosBigButton>
              {data.salesOrderId && (
                <Link
                  href={`/bisnis/penjualan/${data.salesOrderId}`}
                  className="block text-center text-sm text-indigo-600 hover:underline"
                >
                  Lihat Sales Order
                </Link>
              )}
              {importBatchId && (
                <Link
                  href={`/bisnis/penjualan/import/${importBatchId}`}
                  className="block text-center text-sm text-violet-600 hover:underline"
                >
                  Review import / biaya MP
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <PosPickupPrint data={data} />
      </div>

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
          .pickup-print,
          .pickup-print * {
            visibility: visible;
          }
          .pickup-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 72mm !important;
            max-width: 72mm !important;
            margin: 0 !important;
            padding: 2mm !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </>
  );
}
