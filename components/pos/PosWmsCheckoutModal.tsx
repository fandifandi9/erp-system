"use client";

import { useEffect, useState } from "react";
import { Loader2, Store, Truck, X } from "lucide-react";
import { calcCartSubtotal, calcCartTotal } from "@/lib/pos/cart";
import { clearPosCart } from "@/lib/pos/session";
import { savePosReceipt } from "@/lib/pos/receipt";
import type { PosCart, PosDeliveryMode, PosSession } from "@/lib/pos/types";
import { PosBigButton } from "@/components/pos/PosShell";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { AwbLabelPanel } from "@/components/bisnis/AwbLabelPanel";
import { CourierServiceFields } from "@/components/bisnis/CourierServiceFields";
import { uploadAwbLabel } from "@/lib/bisnis/awb-label-client";
import { getErrorMessage } from "@/lib/errors";
import type { PosReceiptData } from "@/lib/pos/receipt";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export type WmsCheckoutComplete = {
  receipt: PosReceiptData;
  importBatchId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  session: PosSession;
  cart: PosCart;
  awb: string;
  onComplete: (result: WmsCheckoutComplete) => void;
};

export function PosWmsCheckoutModal({
  open,
  onClose,
  session,
  cart,
  awb,
  onComplete,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<PosDeliveryMode>("pickup");
  const [shippingAddress, setShippingAddress] = useState("");
  const [courier, setCourier] = useState("");
  const [shippingService, setShippingService] = useState("");
  const [shippingAmount, setShippingAmount] = useState(0);
  const [mpOrderNo, setMpOrderNo] = useState("");
  const [mpOrderError, setMpOrderError] = useState("");
  const [mpOrderChecking, setMpOrderChecking] = useState(false);
  const [mpOrderValid, setMpOrderValid] = useState(true);
  const [awbLabelFile, setAwbLabelFile] = useState<File | null>(null);

  const awbTrimmed = awb.trim();
  const mpOrderTrimmed = mpOrderNo.trim();

  const validateMpOrderNo = async (value: string): Promise<boolean> => {
    const trimmed = value.trim();
    if (!trimmed) {
      setMpOrderError("");
      setMpOrderValid(true);
      return true;
    }
    setMpOrderChecking(true);
    setMpOrderError("");
    try {
      const q = new URLSearchParams({
        orderNo: trimmed,
        store: session.storeId,
        storeName: session.storeName,
      });
      const res = await fetch(`/api/pos/validate-order-no?${q}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memeriksa nomor pesanan");
      if (!data.unique) {
        setMpOrderError(data.message ?? "Nomor pesanan sudah dipakai.");
        setMpOrderValid(false);
        return false;
      }
      setMpOrderValid(true);
      return true;
    } catch (e: unknown) {
      setMpOrderError(getErrorMessage(e, "Gagal memeriksa nomor pesanan"));
      setMpOrderValid(false);
      return false;
    } finally {
      setMpOrderChecking(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setDeliveryMode("pickup");
    setShippingAmount(0);
    setCourier("");
    setShippingService("");
    setAwbLabelFile(null);
    setMpOrderError("");
    setMpOrderValid(true);
  }, [open]);

  useEffect(() => {
    if (!open || !mpOrderTrimmed) {
      setMpOrderError("");
      setMpOrderValid(true);
      return;
    }
    const t = window.setTimeout(() => {
      void validateMpOrderNo(mpOrderTrimmed);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpOrderTrimmed, open, session.storeId]);

  if (!open) return null;

  const subtotal = calcCartSubtotal(cart);
  const discount = Math.min(cart.discountAmount || 0, subtotal);
  const ship = deliveryMode === "courier" ? Math.max(0, shippingAmount) : 0;
  const total = calcCartTotal(cart, ship);

  const submit = async () => {
    if (deliveryMode === "courier") {
      if (!courier.trim() || !shippingService.trim()) {
        setError("Pilih ekspedisi dan layanan pengiriman dari master data.");
        return;
      }
      if (!shippingAddress.trim()) {
        setError("Alamat pengiriman wajib untuk kirim via ekspedisi.");
        return;
      }
    }
    if (awbTrimmed && !awbLabelFile) {
      setError("Unggah label AWB (PDF/gambar) karena nomor AWB sudah diisi.");
      return;
    }
    if (mpOrderTrimmed) {
      const ok = await validateMpOrderNo(mpOrderTrimmed);
      if (!ok) return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pos/complete-wms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          cart,
          checkout: {
            buyerName,
            buyerPhone,
            deliveryMode,
            shippingAddress,
            courier,
            shippingService,
            shippingAmount: ship,
            awb,
            mpOrderNo,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan transaksi");

      if (awbLabelFile && data.salesOrderId) {
        try {
          await uploadAwbLabel(data.salesOrderId, awbLabelFile, "manual");
        } catch (uploadErr: unknown) {
          throw new Error(
            `Transaksi tersimpan (${data.orderNo}), tetapi upload label AWB gagal: ${getErrorMessage(uploadErr)}`,
          );
        }
      }

      const discountAmount = cart.discountAmount || 0;

      const receipt: PosReceiptData = {
        orderNo: data.orderNo,
        salesOrderId: data.salesOrderId,
        mode: "wms",
        storeName: session.storeName,
        warehouseName: session.warehouseName,
        registerName: session.registerName,
        registerCode: session.registerCode,
        registerAddress: session.registerAddress,
        cashierName: session.responsibleName,
        cashierPhone: session.responsiblePhone,
        buyerName: buyerName.trim() || undefined,
        buyerPhone: buyerPhone.trim() || undefined,
        channelName: session.channelName,
        pickupNo: data.pickupNo,
        pickupType: data.pickupType,
        lines: cart.lines.map((l) => ({
          name: l.name,
          sku: l.sku,
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        subtotal,
        discountAmount,
        shippingAmount: ship,
        total,
        payAmount: 0,
        change: 0,
        completedAt: new Date().toISOString(),
      };

      savePosReceipt(receipt);
      clearPosCart();
      onComplete({ receipt, importBatchId: data.importBatchId });
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal menyimpan transaksi"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center print:hidden">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wms-checkout-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h2 id="wms-checkout-title" className="text-lg font-bold text-slate-900">
              Data pengiriman
            </h2>
            <p className="text-xs text-slate-500">
              {session.warehouseName} · Total {fmt(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {error && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            Pembayaran tempo 14 hari otomatis. Setelah simpan, label pickup langsung dicetak.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDeliveryMode("pickup");
                setShippingAmount(0);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
                deliveryMode === "pickup"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 text-slate-700"
              }`}
            >
              <Store className="h-4 w-4" />
              Pickup langsung
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode("courier")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
                deliveryMode === "courier"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 text-slate-700"
              }`}
            >
              <Truck className="h-4 w-4" />
              Kirim ekspedisi
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">
              Nama pembeli <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">
              No. telepon / WA <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              inputMode="tel"
            />
          </div>

          {deliveryMode === "courier" ? (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600">Alamat pengiriman *</label>
                <textarea
                  rows={3}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Alamat lengkap penerima"
                />
              </div>
              <CourierServiceFields
                courierName={courier}
                serviceName={shippingService}
                onCourierChange={(name) => {
                  setCourier(name);
                  setShippingService("");
                }}
                onServiceChange={setShippingService}
                courierLabel="Ekspedisi *"
                serviceLabel="Layanan ekspedisi *"
                inputClassName="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
                labelClassName="text-xs font-semibold text-slate-600"
              />
              <div>
                <label className="text-xs font-semibold text-slate-600">Ongkos kirim</label>
                <div className="mt-1 max-w-xs">
                  <PosMoneyInput value={shippingAmount} onChange={setShippingAmount} />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Pelanggan ambil sendiri di toko — tanpa ekspedisi dan ongkos kirim. Tim gudang tetap
              proses pickup via WMS.
            </p>
          )}

          {awbTrimmed ? (
            <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <p className="text-sm font-semibold text-slate-800">No. AWB: {awbTrimmed}</p>
              <AwbLabelPanel
                pendingFile={awbLabelFile}
                onPendingFileChange={setAwbLabelFile}
                uploadSource="manual"
                compact
              />
              <p className="text-[11px] text-slate-500">
                Wajib unggah label AWB dari marketplace atau kurir agar gudang bisa cetak di
                packing.
              </p>
            </div>
          ) : null}

          <div>
            <label className="text-xs font-semibold text-slate-600">No. pesanan</label>
            <input
              className={`mt-1 w-full rounded-xl border px-4 py-3 ${
                mpOrderError
                  ? "border-red-400 bg-red-50"
                  : "border-slate-300"
              }`}
              value={mpOrderNo}
              onChange={(e) => setMpOrderNo(e.target.value)}
              placeholder="Kosongkan = nomor SO otomatis"
            />
            {mpOrderChecking && (
              <p className="mt-1 text-xs text-slate-500">Memeriksa nomor pesanan di toko ini…</p>
            )}
            {mpOrderError && (
              <p className="mt-1 text-xs font-medium text-red-700">{mpOrderError}</p>
            )}
            {!mpOrderError && mpOrderTrimmed && mpOrderValid && !mpOrderChecking && (
              <p className="mt-1 text-xs text-emerald-700">Nomor pesanan tersedia untuk toko ini.</p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">
              Nomor eksternal (MP, PO) dipakai sebagai No. SO dan kode pickup. Kosongkan → SO urut
              otomatis + kode pickup acak (mis. PK7X2K9M4) agar tidak mudah ditebak di gudang.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="mt-1 flex justify-between text-slate-600">
                <span>Potongan</span>
                <span>-{fmt(discount)}</span>
              </div>
            )}
            {ship > 0 && (
              <div className="mt-1 flex justify-between text-slate-600">
                <span>Ongkos kirim</span>
                <span>{fmt(ship)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>

          <PosBigButton onClick={() => void submit()} disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Memproses…
              </span>
            ) : (
              "Kirim ke WMS & cetak nomor pickup"
            )}
          </PosBigButton>
        </div>
      </div>
    </div>
  );
}
