"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Printer, Plus } from "lucide-react";
import { loadPosSession } from "@/lib/pos/session";
import { loadPosReceipt, type PosReceiptData } from "@/lib/pos/receipt";
import { PosReceiptPrint } from "@/components/pos/PosReceiptPrint";
import { PosPickupPrint } from "@/components/pos/PosPickupPrint";
import { PosShell, PosBigButton } from "@/components/pos/PosShell";

function ReceiptContent() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = (params.get("mode") as "direct" | "wms") || "direct";
  const isWms = mode === "wms";
  const [session, setSession] = useState(loadPosSession());
  const [receipt, setReceipt] = useState<PosReceiptData | null>(null);
  const [loading, setLoading] = useState(true);

  const orderNo = params.get("order") ?? "—";
  const invId = params.get("inv");
  const soId = params.get("so");
  const batchId = params.get("batch");

  useEffect(() => {
    setSession(loadPosSession());

    const cached = loadPosReceipt();
    const hasCached = cached && (isWms ? !!cached.pickupNo : cached.lines.length > 0);
    if (hasCached && cached) {
      setReceipt(cached);
      setLoading(false);
      const printDelay = isWms ? 1500 : 600;
      const printTimer = window.setTimeout(() => {
        try {
          window.print();
        } catch {
          /* cetak dibatalkan */
        }
      }, printDelay);
      const redirectTimer = window.setTimeout(() => {
        router.replace("/pos/sale?done=1");
      }, isWms ? 5000 : 3500);
      return () => {
        window.clearTimeout(printTimer);
        window.clearTimeout(redirectTimer);
      };
    }

    const fetchSo = soId || invId;
    if (!fetchSo) {
      setLoading(false);
      return;
    }

    const q = new URLSearchParams();
    if (soId) q.set("so", soId);
    if (invId) q.set("inv", invId);

    void fetch(`/api/pos/receipt?${q}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.lines && !isWms) return;
        const s = loadPosSession();
        setReceipt({
          orderNo: data.orderNo ?? orderNo,
          invoiceNo: data.invoiceNo,
          invoiceId: invId ?? undefined,
          salesOrderId: data.salesOrderId ?? soId ?? undefined,
          mode,
          storeName: s?.storeName ?? "Toko",
          warehouseName: s?.warehouseName,
          registerName: s?.registerName ?? "POS",
          registerCode: s?.registerCode ?? "",
          registerAddress: s?.registerAddress,
          cashierName: s?.responsibleName ?? "Kasir",
          cashierPhone: s?.responsiblePhone,
          channelName: s?.channelName,
          pickupNo: data.pickupNo,
          pickupType: data.pickupType,
          dueDate: data.dueDate,
          lines: data.lines ?? [],
          subtotal: data.subtotal ?? 0,
          discountAmount: data.discountAmount ?? 0,
          total: data.total ?? 0,
          payAmount: data.total ?? 0,
          change: 0,
          completedAt: data.completedAt ?? new Date().toISOString(),
        });
      })
      .finally(() => setLoading(false));
  }, [soId, invId, orderNo, mode, isWms, router]);

  const printDoc = () => {
    try {
      window.print();
    } catch {
      /* cetak dibatalkan */
    }
  };

  const receiptData: PosReceiptData | null =
    receipt ??
    (session
      ? {
          orderNo,
          mode,
          storeName: session.storeName,
          warehouseName: session.warehouseName,
          registerName: session.registerName,
          registerCode: session.registerCode,
          registerAddress: session.registerAddress,
          cashierName: session.responsibleName,
          cashierPhone: session.responsiblePhone,
          channelName: session.channelName,
          lines: [],
          subtotal: 0,
          discountAmount: 0,
          total: 0,
          payAmount: 0,
          change: 0,
          completedAt: new Date().toISOString(),
        }
      : null);

  const canPrint = isWms ? !!receiptData?.pickupNo : !!receiptData?.lines.length;

  return (
    <PosShell
      title={isWms ? "Nomor pickup" : "Transaksi selesai"}
      subtitle={session?.registerName}
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {isWms ? "Memuat nomor pickup…" : "Memuat struk…"}
        </p>
      ) : receiptData ? (
        isWms ? (
          <PosPickupPrint data={receiptData} />
        ) : (
          <PosReceiptPrint data={receiptData} />
        )
      ) : null}

      <p className="mt-4 text-center text-xs text-slate-500 print:hidden">
        {isWms
          ? "Pesanan tersimpan di WMS. Label pickup dicetak otomatis — tempel di paket."
          : "Transaksi tersimpan. Struk dicetak otomatis — kembali ke kasir dalam beberapa detik."}
      </p>

      <div className="mt-4 grid gap-3 print:hidden">
        <PosBigButton onClick={printDoc} disabled={!canPrint}>
          <span className="inline-flex items-center justify-center gap-2">
            <Printer className="h-5 w-5" /> {isWms ? "Cetak nomor pickup" : "Cetak struk"}
          </span>
        </PosBigButton>
        <PosBigButton variant="secondary" onClick={() => router.push("/pos/sale")}>
          <span className="inline-flex items-center justify-center gap-2">
            <Plus className="h-5 w-5" /> Transaksi baru
          </span>
        </PosBigButton>
        {mode === "direct" && invId && (
          <Link
            href={`/bisnis/penjualan/${invId}`}
            className="block text-center text-sm text-indigo-600 hover:underline"
          >
            Lihat invoice di ERP
          </Link>
        )}
        {mode === "wms" && (
          <>
            {soId && (
              <Link
                href={`/bisnis/penjualan/${soId}`}
                className="block text-center text-sm text-indigo-600 hover:underline"
              >
                Lihat Sales Order
              </Link>
            )}
            {batchId && (
              <Link
                href={`/bisnis/penjualan/import/${batchId}`}
                className="block text-center text-sm text-violet-600 hover:underline"
              >
                Review import / biaya MP
              </Link>
            )}
          </>
        )}
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
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>
    </PosShell>
  );
}

export default function PosReceiptPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Memuat…</div>}>
      <ReceiptContent />
    </Suspense>
  );
}
