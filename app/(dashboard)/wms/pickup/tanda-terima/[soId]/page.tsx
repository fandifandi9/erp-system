"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Printer } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { PickupHandoverReceipt } from "@/components/wms/PickupHandoverReceipt";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getErrorMessage } from "@/lib/errors";
import { PERMINTAAN_BARANG } from "@/lib/wms/permintaan-barang-routes";
import {
  buildHandoverReceiptPrintData,
  printHandoverReceiptForOrder,
} from "@/lib/wms/print-handover-receipt-client";
import type { HandoverReceiptPrintData } from "@/lib/wms/print-handover-receipt";

export default function WmsPickupReceiptPage() {
  const params = useParams();
  const search = useSearchParams();
  const soId = typeof params.soId === "string" ? params.soId : "";
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [data, setData] = useState<HandoverReceiptPrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!soId) return;
    setLoading(true);
    setError("");
    try {
      const row = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
        expand: "warehouse,customer,store",
      });
      setSo(row);
      setData(await buildHandoverReceiptPrintData(row));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [soId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doPrint = useCallback(async () => {
    if (!soId) return;
    setPrinting(true);
    setError("");
    try {
      await printHandoverReceiptForOrder(soId);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPrinting(false);
    }
  }, [soId]);

  useEffect(() => {
    if (loading || !so || !data || search.get("print") !== "1") return;
    const t = window.setTimeout(() => {
      void doPrint();
    }, 400);
    return () => window.clearTimeout(t);
  }, [loading, so, data, search, doPrint]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error && !so) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        {error || "Pesanan tidak ditemukan"}
        <div className="mt-4">
          <Link href={PERMINTAAN_BARANG.pickup} className="text-indigo-600 underline">
            Kembali ke Siap ambil
          </Link>
        </div>
      </div>
    );
  }

  if (!so || !data) return null;

  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const pkgCount = data.items.length;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-md flex-col items-center gap-2 print:hidden">
        <div className="flex justify-center gap-3">
          <button
            type="button"
            disabled={printing}
            onClick={() => void doPrint()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Cetak (80mm)
          </button>
          <Link
            href={PERMINTAAN_BARANG.pickup}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Kembali
          </Link>
        </div>
        <p className="text-center text-[11px] text-slate-500">
          {data.ttNo !== "—"
            ? `TT ${data.ttNo} · ${pkgCount} paket — bukti serah terima kurir.`
            : "Tanda terima ekspedisi — daftar paket yang diserahkan."}
        </p>
        {wf.pickup?.batch_size && wf.pickup.batch_size > 1 ? (
          <p className="text-center text-[11px] text-cyan-700">
            Serah terima kelompok ({wf.pickup.batch_size} paket) — satu nomor TT.
          </p>
        ) : null}
        {error ? <p className="text-center text-sm text-red-700">{error}</p> : null}
      </div>
      <PickupHandoverReceipt
        ttNo={data.ttNo}
        items={data.items}
        warehouseStaff={data.warehouseStaff}
        courierName={data.courierName}
        courierPhone={data.courierPhone}
        courierCompany={data.courierCompany}
        showPrintHint={false}
      />
    </div>
  );
}
