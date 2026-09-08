"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  ScanLine,
  Trash2,
  Minus,
  Plus,
  ShoppingCart,
  Banknote,
  Loader2,
} from "lucide-react";
import {
  loadPosSession,
  loadPosCart,
  savePosCart,
  clearPosCart,
  loadPosPayment,
  savePosPayment,
} from "@/lib/pos/session";
import {
  calcCartSubtotal,
  calcCartTotal,
  newCartLineKey,
  recalcLine,
} from "@/lib/pos/cart";
import { posModeLabel } from "@/lib/pos/meta";
import { savePosReceipt } from "@/lib/pos/receipt";
import { fetchPaymentMethods } from "@/lib/bisnis/client";
import { isCashPaymentMethod } from "@/lib/bisnis/payment-method-value";
import type { PaymentMethodSetting } from "@/lib/bisnis/types";
import type { PosCart, PosCartLine } from "@/lib/pos/types";
import { PosShell, PosCard, PosBigButton } from "@/components/pos/PosShell";
import { PosWmsCheckoutModal } from "@/components/pos/PosWmsCheckoutModal";
import { PosPickupModal } from "@/components/pos/PosPickupModal";
import type { PosReceiptData } from "@/lib/pos/receipt";
import { PosMoneyInput } from "@/components/pos/PosMoneyInput";
import { PosProductThumb } from "@/components/pos/PosProductThumb";
import { getErrorMessage } from "@/lib/errors";
import { LineSerialFields } from "@/components/bisnis/LineSerialFields";
import { validatePosCartSerials } from "@/lib/wms/serial-numbers";
import { autoSubmitDelayMs, shouldAutoSubmitScan } from "@/lib/pos/barcode-scanner";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type ProductHit = {
  id: string;
  sku: string;
  name: string;
  sellPrice: number;
  stock?: number;
  imageUrl?: string | null;
  requiresSerial?: boolean;
};

function SaleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justDone = searchParams.get("done") === "1";
  const [session, setSession] = useState(loadPosSession());
  const [cart, setCart] = useState<PosCart>({ lines: [], discountAmount: 0 });
  const [payAmount, setPayAmount] = useState(0);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [methods, setMethods] = useState<PaymentMethodSetting[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [awb, setAwb] = useState("");
  const [awbError, setAwbError] = useState("");
  const [awbChecking, setAwbChecking] = useState(false);
  const [awbValid, setAwbValid] = useState(true);
  const [wmsModalOpen, setWmsModalOpen] = useState(false);
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [pickupReceipt, setPickupReceipt] = useState<PosReceiptData | null>(null);
  const [wmsBatchId, setWmsBatchId] = useState<string | undefined>();
  const [showDoneBanner, setShowDoneBanner] = useState(justDone);
  const scanRef = useRef<HTMLInputElement>(null);
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlightRef = useRef(false);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    const s = loadPosSession();
    if (!s) {
      router.replace("/pos/setup");
      return;
    }
    setSession(s);
    const c = loadPosCart();
    setCart(c);
    const draft = loadPosPayment();
    setPayAmount(0);
    setAwb(draft.awb ?? "");
    prevTotalRef.current = calcCartTotal(c);
    void fetchPaymentMethods(true).then((m) => {
      setMethods(m);
      const preferred =
        draft.paymentMethodId && m.some((x) => x.id === draft.paymentMethodId)
          ? draft.paymentMethodId
          : m[0]?.id;
      if (preferred) setPaymentMethodId(preferred);
    });
  }, [router]);

  const persistCart = useCallback((next: PosCart) => {
    setCart(next);
    savePosCart(next);
    prevTotalRef.current = calcCartTotal(next);
  }, []);

  const persistPay = useCallback(
    (amount: number) => {
      setPayAmount(amount);
      savePosPayment({ payAmount: amount, paymentMethodId });
    },
    [paymentMethodId],
  );

  const searchProducts = useCallback(
    async (q: string) => {
      if (!session?.warehouseId || q.length < 1) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({
          q,
          warehouse: session.warehouseId,
        });
        if (session.storeId) params.set("store", session.storeId);
        const res = await fetch(`/api/pos/products?${params}`, { credentials: "include" });
        const data = (await res.json()) as { items?: ProductHit[]; error?: string };
        setHits(data.items ?? []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    },
    [session?.warehouseId, session?.storeId],
  );

  useEffect(() => {
    const t = setTimeout(() => void searchProducts(query), 280);
    return () => clearTimeout(t);
  }, [query, searchProducts]);

  useEffect(() => {
    if (!session || wmsModalOpen || pickupModalOpen) return;
    const t = window.setTimeout(() => scanRef.current?.focus(), 100);
    return () => window.clearTimeout(t);
  }, [session, wmsModalOpen, pickupModalOpen]);

  useEffect(
    () => () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    },
    [],
  );

  const validateAwb = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setAwbError("");
        setAwbValid(true);
        return true;
      }
      if (!session?.storeId) return false;
      setAwbChecking(true);
      setAwbError("");
      try {
        const q = new URLSearchParams({
          awb: trimmed,
          store: session.storeId,
          storeName: session.storeName,
        });
        const res = await fetch(`/api/pos/validate-awb?${q}`, { credentials: "include" });
        const data = (await res.json()) as {
          unique?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Gagal cek AWB");
        if (!data.unique) {
          setAwbError(data.message ?? "No. AWB sudah dipakai di toko ini.");
          setAwbValid(false);
          return false;
        }
        setAwbValid(true);
        return true;
      } catch (e: unknown) {
        setAwbError(getErrorMessage(e, "Gagal cek AWB"));
        setAwbValid(false);
        return false;
      } finally {
        setAwbChecking(false);
      }
    },
    [session?.storeId, session?.storeName],
  );

  useEffect(() => {
    if (session?.mode !== "wms") return;
    const t = setTimeout(() => {
      void validateAwb(awb);
    }, 450);
    return () => clearTimeout(t);
  }, [awb, session?.mode, validateAwb]);

  const addProduct = useCallback(
    (p: ProductHit) => {
      setCart((prevCart) => {
        const existing = prevCart.lines.find((l) => l.productId === p.id);
        let lines: PosCartLine[];
        if (existing) {
          lines = prevCart.lines.map((l) => {
            if (l.productId !== p.id) return l;
            const qty = l.qty + 1;
            const serials = [...(l.serials ?? [])];
            while (serials.length < qty) serials.push("");
            return recalcLine({ ...l, qty, serials: serials.slice(0, qty) });
          });
        } else {
          lines = [
            ...prevCart.lines,
            recalcLine({
              key: newCartLineKey(),
              productId: p.id,
              sku: p.sku,
              name: p.name,
              imageUrl: p.imageUrl,
              qty: 1,
              unitPrice: p.sellPrice,
              lineTotal: p.sellPrice,
              stockAvailable: p.stock,
              requiresSerial: !!p.requiresSerial,
              serials: p.requiresSerial ? [""] : [],
            }),
          ];
        }
        const next = { ...prevCart, lines };
        savePosCart(next);
        prevTotalRef.current = calcCartTotal(next);
        return next;
      });
      setQuery("");
      setHits([]);
      setError("");
      requestAnimationFrame(() => scanRef.current?.focus());
    },
    [],
  );

  const submitScan = useCallback(
    async (raw?: string) => {
      const code = (raw ?? scanRef.current?.value ?? query).trim();
      if (!code || !session?.warehouseId || scanInFlightRef.current) return;
      if (autoScanTimerRef.current) {
        clearTimeout(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
      scanInFlightRef.current = true;
      setSearching(true);
      setError("");
      try {
        const params = new URLSearchParams({
          code,
          warehouse: session.warehouseId,
        });
        if (session.storeId) params.set("store", session.storeId);
        const res = await fetch(`/api/pos/scan?${params}`, { credentials: "include" });
        const data = (await res.json()) as { item?: ProductHit; error?: string };
        if (!res.ok || !data.item) {
          setError(data.error ?? `Produk tidak ditemukan: ${code}`);
          void searchProducts(code);
          return;
        }
        addProduct(data.item);
      } catch (e: unknown) {
        setError(getErrorMessage(e, "Gagal scan produk"));
      } finally {
        scanInFlightRef.current = false;
        setSearching(false);
      }
    },
    [addProduct, query, searchProducts, session?.storeId, session?.warehouseId],
  );

  const queueAutoScan = useCallback(
    (code: string) => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      const trimmed = code.trim();
      if (!shouldAutoSubmitScan(trimmed)) return;
      autoScanTimerRef.current = setTimeout(() => {
        autoScanTimerRef.current = null;
        void submitScan(trimmed);
      }, autoSubmitDelayMs(trimmed));
    },
    [submitScan],
  );

  const handleScanInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    queueAutoScan(v);
  };

  const updateLine = (key: string, patch: Partial<PosCartLine>) => {
    const lines = cart.lines.map((l) => {
      if (l.key !== key) return l;
      const merged = { ...l, ...patch };
      if (patch.qty != null) {
        const serials = [...(merged.serials ?? [])];
        while (serials.length < merged.qty) serials.push("");
        merged.serials = serials.slice(0, merged.qty);
      }
      return recalcLine(merged);
    });
    persistCart({ ...cart, lines });
  };

  const updateLineSerials = (key: string, serials: string[]) => {
    const lines = cart.lines.map((l) => (l.key === key ? { ...l, serials } : l));
    persistCart({ ...cart, lines });
  };

  const removeLine = (key: string) => {
    persistCart({ ...cart, lines: cart.lines.filter((l) => l.key !== key) });
  };

  const completeDirect = async () => {
    if (!session) return;
    const snMsg = validatePosCartSerials(cart);
    if (snMsg) {
      setError(snMsg);
      return;
    }
    if (!paymentMethodId) {
      setError("Pilih metode pembayaran terlebih dahulu.");
      return;
    }
    const pm = methods.find((m) => m.id === paymentMethodId);
    const cash = isCashPaymentMethod(pm);
    const totalNow = calcCartTotal(cart);
    if (cash && payAmount < totalNow) {
      setError(`Nominal tunai kurang ${fmt(totalNow - payAmount)} dari total.`);
      return;
    }
    const effectivePay = cash ? payAmount : totalNow;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/pos/complete-direct", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          cart,
          checkout: {
            buyerName: buyerName.trim() || undefined,
            buyerPhone: buyerPhone.trim() || undefined,
            paymentMethodId,
            payAmount: effectivePay,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan transaksi");

      const subtotal = calcCartSubtotal(cart);
      const discountAmount = cart.discountAmount || 0;
      const pmLabel = pm?.name;

      savePosReceipt({
        orderNo: data.orderNo,
        invoiceNo: data.invoiceNo,
        invoiceId: data.invoiceId,
        salesOrderId: data.salesOrderId,
        mode: "direct",
        storeName: session.storeName,
        warehouseName: session.warehouseName,
        registerName: session.registerName,
        registerCode: session.registerCode,
        registerAddress: session.registerAddress,
        cashierName: session.responsibleName,
        cashierPhone: session.responsiblePhone,
        buyerName: buyerName.trim() || undefined,
        buyerPhone: buyerPhone.trim() || undefined,
        paymentMethodName: pmLabel,
        isCashPayment: cash,
        lines: cart.lines.map((l) => ({
          name: l.name,
          sku: l.sku,
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        subtotal,
        discountAmount,
        total: totalNow,
        payAmount: effectivePay,
        change: cash ? Math.max(0, payAmount - totalNow) : 0,
        completedAt: new Date().toISOString(),
      });

      clearPosCart();
      setCart({ lines: [], discountAmount: 0 });
      setPayAmount(0);
      setBuyerName("");
      setBuyerPhone("");
      const q = new URLSearchParams({
        mode: "direct",
        inv: data.invoiceId,
        so: data.salesOrderId,
        order: data.orderNo,
      });
      router.push(`/pos/receipt?${q.toString()}`);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal menyimpan transaksi"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) return null;

  const subtotal = calcCartSubtotal(cart);
  const total = calcCartTotal(cart);
  const change = Math.max(0, payAmount - total);
  const isDirect = session.mode === "direct";
  const isWms = !isDirect;
  const selectedPm = methods.find((m) => m.id === paymentMethodId);
  const isCash = isCashPaymentMethod(selectedPm);
  const awbTrimmed = awb.trim();
  const awbBlocksWms =
    isWms && awbTrimmed.length > 0 && (awbChecking || !awbValid || !!awbError);
  const serialBlockMsg = isDirect ? validatePosCartSerials(cart) : null;
  const canProceed =
    cart.lines.length > 0 &&
    !serialBlockMsg &&
    !awbBlocksWms &&
    (isDirect ? paymentMethodId && (!isCash || payAmount >= total) : true);

  const proceedWms = async () => {
    if (!session) return;
    if (awbTrimmed) {
      const ok = await validateAwb(awbTrimmed);
      if (!ok) return;
    }
    savePosPayment({ payAmount: 0, awb: awbTrimmed });
    setWmsModalOpen(true);
  };

  const handleWmsComplete = (result: { receipt: PosReceiptData; importBatchId: string }) => {
    setWmsModalOpen(false);
    setCart({ lines: [], discountAmount: 0 });
    setAwb("");
    setAwbError("");
    setAwbValid(true);
    savePosPayment({ payAmount: 0, paymentMethodId, awb: "" });
    setPickupReceipt(result.receipt);
    setWmsBatchId(result.importBatchId);
    setPickupModalOpen(true);
  };

  const closePickupModal = () => {
    setPickupModalOpen(false);
    setPickupReceipt(null);
    setWmsBatchId(undefined);
    setShowDoneBanner(true);
    router.replace("/pos/sale?done=1");
  };

  return (
    <PosShell
      title="Transaksi"
      subtitle={`${session.registerName} · ${posModeLabel(session.mode)} · PJ ${session.responsibleName}`}
    >
      {showDoneBanner && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Transaksi berhasil disimpan. Silakan mulai transaksi baru.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={scanRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            placeholder="Scan barcode / SKU / nama produk"
            className="w-full rounded-xl border border-slate-300 py-3.5 pl-11 pr-4 text-base font-mono"
            value={query}
            onChange={handleScanInputChange}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const code = (e.currentTarget as HTMLInputElement).value.trim();
              if (code) {
                void submitScan(code);
                return;
              }
              if (hits[0]) addProduct(hits[0]);
            }}
          />
        </div>
      </div>

      {hits.length > 0 && (
        <PosCard className="mb-4 max-h-48 overflow-y-auto">
          {searching && <p className="text-sm text-slate-500">Mencari…</p>}
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0 hover:bg-slate-50"
            >
              <PosProductThumb src={p.imageUrl} alt={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="font-mono text-xs text-slate-500">{p.sku}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-indigo-700">{fmt(p.sellPrice)}</p>
                {p.stock != null && (
                  <p
                    className={`text-xs ${
                      p.stock < 0 ? "font-medium text-red-600" : p.stock === 0 ? "text-amber-600" : "text-slate-500"
                    }`}
                  >
                    Stok: {p.stock < 0 ? `−${Math.abs(p.stock)}` : p.stock}
                  </p>
                )}
              </div>
            </button>
          ))}
        </PosCard>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PosCard className="mb-4 lg:mb-0">
            <p className="mb-3 flex items-center gap-2 font-semibold text-slate-800">
              <ShoppingCart className="h-5 w-5" /> Keranjang ({cart.lines.length})
            </p>
            {cart.lines.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                <ScanLine className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Scan atau cari produk untuk mulai
              </p>
            ) : (
              <ul className="space-y-4">
                {cart.lines.map((line) => (
                  <li
                    key={line.key}
                    className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                  >
                    <PosProductThumb src={line.imageUrl} alt={line.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{line.name}</p>
                          <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="shrink-0 text-red-500"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                          <button
                            type="button"
                            className="px-3 py-2"
                            onClick={() =>
                              updateLine(line.key, { qty: Math.max(1, line.qty - 1) })
                            }
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="min-w-[2rem] text-center font-bold">{line.qty}</span>
                          <button
                            type="button"
                            className="px-3 py-2"
                            onClick={() => updateLine(line.key, { qty: line.qty + 1 })}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="w-36">
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase text-slate-500">
                            Harga
                          </span>
                          <PosMoneyInput
                            value={line.unitPrice}
                            onChange={(v) => updateLine(line.key, { unitPrice: v })}
                          />
                        </div>
                        <span className="ml-auto font-bold text-slate-900">
                          {fmt(line.lineTotal)}
                        </span>
                      </div>
                      {isDirect && line.requiresSerial ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                          <LineSerialFields
                            qty={line.qty}
                            serials={line.serials ?? []}
                            onChange={(serials) => updateLineSerials(line.key, serials)}
                            compact
                          />
                        </div>
                      ) : isWms && line.requiresSerial ? (
                        <p className="mt-2 text-xs text-violet-700">
                          SN wajib — diisi tim gudang saat picking di WMS.
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PosCard>
        </div>

        <div className="space-y-4">
          <PosCard className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="pb-2 text-sm text-slate-600">Potongan</span>
              <div className="w-40">
                <PosMoneyInput
                  value={cart.discountAmount || 0}
                  onChange={(v) => persistCart({ ...cart, discountAmount: v })}
                />
              </div>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold">
              <span>Total</span>
              <span className="text-indigo-700">{fmt(total)}</span>
            </div>

            {isWms && (
              <div className="border-t border-slate-200 pt-3">
                <label className="text-xs font-semibold text-slate-600">
                  No. AWB <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-sm ${
                    awbError
                      ? "border-red-400 bg-red-50 focus:border-red-500"
                      : "border-slate-300 focus:border-indigo-500"
                  }`}
                  value={awb}
                  onChange={(e) => {
                    setAwb(e.target.value);
                    savePosPayment({ payAmount: 0, awb: e.target.value.trim() });
                  }}
                  placeholder="Kosongkan → nomor pickup otomatis"
                />
                {awbChecking && (
                  <p className="mt-1 text-xs text-slate-500">Memeriksa AWB di toko ini…</p>
                )}
                {awbError && (
                  <p className="mt-1 text-xs font-medium text-red-700">{awbError}</p>
                )}
                {!awbError && awbTrimmed && awbValid && !awbChecking && (
                  <p className="mt-1 text-xs text-emerald-700">AWB tersedia untuk toko ini.</p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  AWB harus unik per toko ({session.storeName}). Duplikat tidak bisa dilanjutkan.
                </p>
              </div>
            )}

            {isDirect && (
              <>
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      Nama pembeli <span className="font-normal text-slate-400">(opsional)</span>
                    </label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">
                      No. telepon / WA <span className="font-normal text-slate-400">(opsional)</span>
                    </label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      inputMode="tel"
                      placeholder=""
                    />
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <label className="mb-2 block text-xs font-semibold text-slate-600">
                    Metode pembayaran
                  </label>
                  <select
                    className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    value={paymentMethodId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPaymentMethodId(id);
                      const pm = methods.find((m) => m.id === id);
                      if (!isCashPaymentMethod(pm)) {
                        setPayAmount(0);
                        savePosPayment({ payAmount: 0, paymentMethodId: id });
                      } else {
                        savePosPayment({ payAmount, paymentMethodId: id });
                      }
                    }}
                  >
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isCash && (
                  <>
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <Banknote className="h-4 w-4" /> Pembayaran tunai
                      </p>
                      <PosMoneyInput
                        label="Nominal dibayar"
                        size="lg"
                        value={payAmount}
                        placeholder=""
                        onChange={persistPay}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          { label: "Pas", value: total },
                          { label: "50 rb", value: 50_000 },
                          { label: "100 rb", value: 100_000 },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => persistPay(btn.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between rounded-xl bg-emerald-50 px-3 py-3">
                      <span className="font-semibold text-emerald-800">Kembali</span>
                      <span className="text-xl font-bold text-emerald-700">{fmt(change)}</span>
                    </div>
                    {payAmount > 0 && payAmount < total && (
                      <p className="text-xs text-amber-700">
                        Nominal kurang {fmt(total - payAmount)} dari total.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </PosCard>

          {serialBlockMsg ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {serialBlockMsg}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <PosBigButton
              variant="secondary"
              onClick={() => {
                if (confirm("Kosongkan keranjang?")) {
                  clearPosCart();
                  setCart({ lines: [], discountAmount: 0 });
                  setPayAmount(0);
                  setAwb("");
                  setAwbError("");
                  setAwbValid(true);
                  savePosPayment({ payAmount: 0, paymentMethodId, awb: "" });
                }
              }}
            >
              Kosongkan
            </PosBigButton>
            <PosBigButton
              disabled={!canProceed || submitting}
              onClick={() => {
                if (isDirect) {
                  void completeDirect();
                  return;
                }
                void proceedWms();
              }}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" /> Memproses…
                </span>
              ) : isDirect ? (
                "Bayar & selesai"
              ) : (
                "Lanjut pengiriman & pickup"
              )}
            </PosBigButton>
          </div>
        </div>
      </div>

      {session && isWms && (
        <PosWmsCheckoutModal
          open={wmsModalOpen}
          onClose={() => setWmsModalOpen(false)}
          session={session}
          cart={cart}
          awb={awbTrimmed}
          onComplete={handleWmsComplete}
        />
      )}

      <PosPickupModal
        open={pickupModalOpen}
        data={pickupReceipt}
        importBatchId={wmsBatchId}
        onClose={closePickupModal}
      />
    </PosShell>
  );
}

export default function PosSalePage() {
  return (
    <Suspense fallback={null}>
      <SaleContent />
    </Suspense>
  );
}
