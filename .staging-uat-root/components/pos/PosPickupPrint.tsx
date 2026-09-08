"use client";

import type { PosReceiptData } from "@/lib/pos/receipt";
import { PosCode128Barcode } from "@/components/pos/PosCode128Barcode";
import { buildPkQrPayload } from "@/lib/wms/pk-number";

export function PosPickupPrint({ data }: { data: PosReceiptData }) {
  const dt = new Date(data.completedAt);
  const dateStr = dt.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = dt.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const pickupNo = data.pickupNo ?? "—";
  const isAwb = data.pickupType === "awb";
  const barcodeValue = isAwb ? pickupNo : buildPkQrPayload(pickupNo);

  return (
    <div className="pickup-print mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-black">
      <p className="text-center text-[10px] uppercase tracking-widest text-slate-600">
        Nomor pickup / lacak
      </p>
      <h1 className="mt-1 text-center text-sm font-bold uppercase">{data.storeName}</h1>
      {data.warehouseName && (
        <p className="text-center text-[10px] text-slate-600">Gudang: {data.warehouseName}</p>
      )}

      <div className="my-4 rounded-xl border-2 border-dashed border-slate-800 px-3 py-4 text-center">
        <p className="text-[10px] uppercase tracking-wide text-slate-600">
          {isAwb ? "No. AWB / resi" : "Kode pickup gudang"}
        </p>
        <div className="my-3 flex justify-center">
          <PosCode128Barcode value={barcodeValue} height={72} />
        </div>
        <p className="break-all text-2xl font-bold tracking-wider">{pickupNo}</p>
        {!isAwb && (
          <p className="mt-2 text-[9px] text-slate-500">
            Tunjukkan ke gudang — berbeda dari No. SO jika SO otomatis (anti tebak nomor)
          </p>
        )}
      </div>

      <div className="space-y-1 text-[10px]">
        <p>
          <span className="text-slate-600">No. order:</span> {data.orderNo}
        </p>
        {data.channelName && (
          <p>
            <span className="text-slate-600">Marketplace:</span> {data.channelName}
          </p>
        )}
        <p>
          <span className="text-slate-600">Tanggal:</span> {dateStr} {timeStr}
        </p>
        {(data.buyerName || data.buyerPhone) && (
          <p>
            <span className="text-slate-600">Pembeli:</span> {data.buyerName ?? "—"}
            {data.buyerPhone ? ` · ${data.buyerPhone}` : ""}
          </p>
        )}
        <p>
          <span className="text-slate-600">Kasir:</span> {data.cashierName}
        </p>
      </div>

      {data.lines.length > 0 && (
        <>
          <hr className="my-3 border-dashed border-slate-400" />
          <p className="mb-1 text-[9px] uppercase text-slate-600">Isi pesanan</p>
          <ul className="space-y-1 text-[10px]">
            {data.lines.map((l, i) => (
              <li key={`${l.sku}-${i}`} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {l.qty}× {l.name}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <hr className="my-3 border-dashed border-slate-400" />
      <p className="text-center text-[9px] text-slate-600">
        {isAwb ? "Tempel di paket · scan AWB di packing" : "Scan PK di gudang (serba:pk:…)"}
      </p>
    </div>
  );
}
