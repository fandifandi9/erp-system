"use client";

import type { PosReceiptData } from "@/lib/pos/receipt";
import { fmtIdNumber } from "@/lib/format-id-number";

const money = (n: number) => `Rp ${fmtIdNumber(Math.round(n))}`;

export function PosReceiptPrint({ data }: { data: PosReceiptData }) {
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

  return (
    <div className="receipt-print mx-auto w-full max-w-[320px] bg-white p-4 font-mono text-[11px] leading-snug text-black">
      <p className="text-center text-[10px] uppercase tracking-widest">Struk penjualan</p>
      <h1 className="mt-1 text-center text-sm font-bold uppercase">{data.storeName}</h1>
      {data.registerAddress && (
        <p className="text-center text-[10px]">{data.registerAddress}</p>
      )}

      <div className="mt-2 space-y-0.5 text-[10px]">
        <p>
          <span className="text-slate-600">POS:</span> {data.registerName}{" "}
          <span className="text-slate-500">({data.registerCode})</span>
        </p>
        <p>
          <span className="text-slate-600">Kasir:</span> {data.cashierName}
          {data.cashierPhone ? ` · ${data.cashierPhone}` : ""}
        </p>
        {data.warehouseName && (
          <p>
            <span className="text-slate-600">Gudang:</span> {data.warehouseName}
          </p>
        )}
        <p>
          <span className="text-slate-600">No. transaksi:</span> {data.orderNo}
        </p>
        {data.invoiceNo && (
          <p>
            <span className="text-slate-600">Invoice:</span> {data.invoiceNo}
          </p>
        )}
        <p>
          <span className="text-slate-600">Tanggal:</span> {dateStr} {timeStr}
        </p>
      </div>

      <hr className="my-2 border-dashed border-slate-400" />

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-dashed border-slate-400 text-left text-[9px] uppercase text-slate-600">
            <th className="pb-1 pr-1">Produk</th>
            <th className="pb-1 pr-1 text-center w-8">Qty</th>
            <th className="pb-1 pr-1 text-right">Harga</th>
            <th className="pb-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, i) => (
            <tr key={`${line.sku ?? line.name}-${i}`} className="align-top">
              <td className="py-1 pr-1">
                <div className="font-semibold">{line.name}</div>
                {line.sku && <div className="text-[9px] text-slate-500">{line.sku}</div>}
              </td>
              <td className="py-1 pr-1 text-center">{line.qty}</td>
              <td className="py-1 pr-1 text-right whitespace-nowrap">
                {fmtIdNumber(line.unitPrice)}
              </td>
              <td className="py-1 text-right whitespace-nowrap font-semibold">
                {fmtIdNumber(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="my-2 border-dashed border-slate-400" />

      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(data.subtotal)}</span>
        </div>
        {data.discountAmount > 0 && (
          <div className="flex justify-between">
            <span>Potongan</span>
            <span>-{money(data.discountAmount)}</span>
          </div>
        )}
        {(data.shippingAmount ?? 0) > 0 && (
          <div className="flex justify-between">
            <span>Ongkir</span>
            <span>{money(data.shippingAmount ?? 0)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-bold">
          <span>TOTAL</span>
          <span>{money(data.total)}</span>
        </div>
        {data.mode === "direct" && data.paymentMethodName && (
          <div className="flex justify-between">
            <span>Bayar</span>
            <span>{data.paymentMethodName}</span>
          </div>
        )}
        {data.mode === "direct" && data.isCashPayment && (
          <>
            <div className="flex justify-between">
              <span>Nominal dibayar</span>
              <span>{money(data.payAmount)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Kembali</span>
              <span>{money(data.change)}</span>
            </div>
          </>
        )}
      </div>

      {(data.buyerName || data.buyerPhone) && (
        <>
          <hr className="my-2 border-dashed border-slate-400" />
          <p className="text-[10px]">
            <span className="text-slate-600">Pembeli:</span> {data.buyerName ?? "—"}
            {data.buyerPhone ? ` · ${data.buyerPhone}` : ""}
          </p>
        </>
      )}

      <hr className="my-2 border-dashed border-slate-400" />
      <p className="text-center text-[9px] text-slate-600">
        {data.mode === "direct"
          ? "Terima kasih atas kunjungan Anda"
          : "Pesanan MP — menunggu proses gudang"}
      </p>
      <p className="mt-1 text-center text-[8px] text-slate-400">Powered by SERBA ERP</p>
    </div>
  );
}
