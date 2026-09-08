"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Ban, Printer, FileText, Truck, Warehouse, RotateCcw, CreditCard, X } from "lucide-react";
import {
  fetchPurchaseBill,
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  cancelPurchaseBill,
  fetchStores,
  fetchBillPayments,
  fetchPaymentMethods,
  createBillFromPurchaseOrder,
  fetchPurchaseBillByPurchaseOrder,
  canEditPurchaseOrder,
  getPurchaseOrderDocStatus,
  ORDER_DOC_STATUS_UI,
  sendPurchaseOrderToWarehouse,
  canSendPurchaseOrderToWarehouse,
  canCreateBillFromPurchaseOrder,
  billBlockedReason,
  getPurchaseWmsDisplayStatus,
  getWarehouseProcessStatus,
  fmtWarehouseProcessedAt,
  createPurchaseReturFromOrderApi,
} from "@/lib/bisnis/client";
import { PurchaseQcExceptionPanel } from "@/components/bisnis/PurchaseQcExceptionPanel";
import { canCreatePurchaseRetur } from "@/lib/bisnis/purchase-retur-create";
import { pb } from "@/lib/pocketbase";
import {
  PURCHASE_STATUS_UI,
  getPurchaseDisplayStatus,
  canEditPurchaseBill,
  canCancelPurchaseBill,
  syncBillOverdueStatus,
  isCashPurchase,
} from "@/lib/bisnis/purchase-status";
import { CancelPurchaseModal } from "@/components/bisnis/CancelPurchaseModal";
import { applyBillPayment } from "@/lib/bisnis/bill-payment";
import { fetchCashAccounts } from "@/lib/bisnis/cash-client";
import { pickPrimaryCashAccountId } from "@/lib/bisnis/entity-modules";
import { useWorkContext } from "@/components/WorkContextProvider";
import type { BillPayment } from "@/lib/bisnis/client";
import { findPaymentMethod, paymentMethodLabel } from "@/lib/bisnis/payment-method-value";
import type { CashAccount, PaymentMethodSetting, PurchaseBill, PurchaseOrder, PurchaseOrderLine } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import type { Store } from "@/lib/bisnis/types";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";
import { BizDocumentSheet } from "@/components/bisnis/BizDocumentSheet";
import { openBizDocumentPrint } from "@/lib/bisnis/doc-print";
import { buildBillPrintData, buildPurchaseOrderPrintData } from "@/lib/bisnis/doc-print-mappers";
import { useLocale } from "@/components/LocaleProvider";

const PURCHASE_STATUS_KEY: Record<string, string> = {
  unpaid: "purchase.filter.unpaid",
  overdue: "purchase.filter.overdue",
  paid: "purchase.filter.paid",
  cancelled: "purchase.filter.cancelled",
};

const ORDER_STATUS_KEY: Record<string, string> = {
  draft: "purchase.filter.draft",
  finished: "purchase.filter.finished",
  cancelled: "purchase.filter.cancelled",
};

const fmtRp = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/,/g, ".")) || 0;
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function PembelianDetailPage() {
  const { t } = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const payRequested = searchParams.get("pay") === "1";
  const { context: workCtx } = useWorkContext();
  const [mode, setMode] = useState<"bill" | "po">("bill");
  const [bill, setBill] = useState<PurchaseBill | null>(null);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [linkedPo, setLinkedPo] = useState<PurchaseOrder | null>(null);
  const [linkedBill, setLinkedBill] = useState<PurchaseBill | null>(null);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);
  const [sendingWarehouse, setSendingWarehouse] = useState(false);
  const [creatingRetur, setCreatingRetur] = useState(false);
  const [storeInfo, setStoreInfo] = useState<Store | null>(null);
  const [billPayments, setBillPayments] = useState<BillPayment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSetting[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    payment_method: "",
    cash_account: "",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        const fetched = await fetchPurchaseBill(id);
        const b = await syncBillOverdueStatus(fetched);
        setMode("bill");
        setBill(b);
        setPo(null);
        setLinkedBill(null);
        fetchBillPayments(b.id).then(setBillPayments).catch(() => setBillPayments([]));
        fetchPaymentMethods().then(setPaymentMethods).catch(() => setPaymentMethods([]));
        const billCompanyId = b.company || workCtx?.companyId;
        fetchCashAccounts(true, billCompanyId).then(setCashAccounts).catch(() => setCashAccounts([]));
        let poForWms: PurchaseOrder | null = b.expand?.purchase_order ?? null;
        if (b.purchase_order) {
          try {
            poForWms = await fetchPurchaseOrder(b.purchase_order);
          } catch {
            /* keep expand */
          }
          const l = await fetchPurchaseOrderLines(b.purchase_order);
          setLines(l);
        } else {
          setLines([]);
        }
        setLinkedPo(poForWms);
        const wh = poForWms?.warehouse ?? b.expand?.purchase_order?.warehouse;
        if (wh) {
          const st = await fetchStores(false, b.company || workCtx?.companyId).catch(() => [] as Store[]);
          setStoreInfo(st.find((x) => x.default_warehouse === wh) ?? null);
        } else {
          setStoreInfo(null);
        }
        return;
      } catch {
        // Bukan id tagihan — coba sebagai PO
      }

      const poData = await fetchPurchaseOrder(id);
      const linkedBill = await fetchPurchaseBillByPurchaseOrder(poData.id);
      if (linkedBill) {
        router.replace(`/bisnis/pembelian/${linkedBill.id}${payRequested ? "?pay=1" : ""}`);
        return;
      }
      setMode("po");
      setPo(poData);
      setLinkedPo(null);
      setBill(null);
      const lb = await fetchPurchaseBillByPurchaseOrder(poData.id);
      setLinkedBill(lb);
      const l = await fetchPurchaseOrderLines(poData.id);
      setLines(l);
      const wh = poData.warehouse;
      if (wh) {
        const st = await fetchStores(false, poData.company || workCtx?.companyId).catch(() => [] as Store[]);
        setStoreInfo(st.find((x) => x.default_warehouse === wh) ?? null);
      } else {
        setStoreInfo(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("purchase.detail.errLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, workCtx?.companyId, router, payRequested]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!payRequested || loading || mode !== "bill" || !bill || showPayModal) return;
    const disp = getPurchaseDisplayStatus(bill);
    if (disp === "paid" || disp === "cancelled" || isCashPurchase(bill) || (bill.remaining ?? 0) <= 0) {
      return;
    }
    setPayForm({
      amount: bill.remaining ?? 0,
      payment_method: "",
      cash_account: pickPrimaryCashAccountId(cashAccounts),
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setShowPayModal(true);
    router.replace(`/bisnis/pembelian/${bill.id}`, { scroll: false });
  }, [payRequested, loading, mode, bill, cashAccounts, showPayModal, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || (!bill && !po)) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-red-600">{error || t("purchase.detail.notFound")}</p>
        <Link href="/bisnis/pembelian" className="mt-4 inline-block text-sm text-indigo-600">
          {t("purchase.detail.back")}
        </Link>
      </div>
    );
  }

  const supplier = mode === "po" ? po?.expand?.supplier : bill?.expand?.supplier;

  const handleCreateBill = async () => {
    if (!po) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert(t("purchase.detail.errRelogin"));
      return;
    }
    if (!canCreateBillFromPurchaseOrder(po)) {
      alert(billBlockedReason(po) ?? t("purchase.detail.poNotReadyBill"));
      return;
    }
    setCreatingBill(true);
    try {
      const newBill = await createBillFromPurchaseOrder(po.id, userId);
      router.push(`/bisnis/pembelian/${newBill.id}`);
    } catch (e: unknown) {
      alert(getErrorMessage(e, t("purchase.detail.errCreateBill")));
    } finally {
      setCreatingBill(false);
    }
  };

  const handleCreateRetur = async (targetPo: PurchaseOrder) => {
    setCreatingRetur(true);
    try {
      const { retur } = await createPurchaseReturFromOrderApi(targetPo.id);
      router.push(`/bisnis/retur/${retur.id}`);
    } catch (e: unknown) {
      alert(getErrorMessage(e, t("purchase.detail.errCreateRetur")));
    } finally {
      setCreatingRetur(false);
    }
  };

  const openPayModal = () => {
    setPayForm({
      amount: bill?.remaining ?? 0,
      payment_method: "",
      cash_account: pickPrimaryCashAccountId(cashAccounts),
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setShowPayModal(true);
  };

  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bill || payForm.amount <= 0) return;
    if (!payForm.cash_account) {
      alert("Akun kas/bank sumber dana wajib dipilih (mil entitas tagihan ini)");
      return;
    }
    const matchedMethod = findPaymentMethod(paymentMethods, payForm.payment_method.trim());
    if (!matchedMethod) {
      alert("Metode pembayaran wajib dipilih");
      return;
    }
    setPaySubmitting(true);
    try {
      const userId = (pb.authStore.model?.id as string | undefined) || bill.created_by || "";
      await applyBillPayment({
        bill,
        amount: payForm.amount,
        paymentDate: payForm.payment_date,
        paymentMethod: matchedMethod,
        cashAccountId: payForm.cash_account,
        notes: payForm.notes,
        createdBy: userId,
      });
      setShowPayModal(false);
      await load();
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Gagal menyimpan pembayaran hutang"));
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleSendToWarehouse = async (target?: PurchaseOrder | null) => {
    const row = target ?? po ?? linkedPo ?? null;
    if (!row) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert(t("purchase.detail.errRelogin"));
      return;
    }
    setSendingWarehouse(true);
    try {
      await sendPurchaseOrderToWarehouse(row.id, userId);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, t("purchase.detail.errSendWh")));
    } finally {
      setSendingWarehouse(false);
    }
  };

  if (mode === "po" && po) {
    const docStatus = getPurchaseOrderDocStatus(po);
    const poSt = ORDER_DOC_STATUS_UI[docStatus];
    const poEditable = canEditPurchaseOrder(po);
    const whSt = getPurchaseWmsDisplayStatus(po);
    const whStatus = getWarehouseProcessStatus(po);
    const canSendWh = canSendPurchaseOrderToWarehouse(po);
    const canBill = canCreateBillFromPurchaseOrder(po);
    const billBlock = billBlockedReason(po);
    const processorName =
      po.expand?.warehouse_processed_by?.name ||
      po.expand?.warehouse_processed_by?.email ||
      null;
    const ordererName =
      po.expand?.created_by?.name || po.expand?.created_by?.email || null;
    const awaitingBusinessRecv = po.receiving_business_status === "awaiting_business";
    const autoReceived =
      Boolean(po.receiving_auto_proceeded_at) &&
      po.receiving_business_status === "resolved" &&
      po.exception_status !== "open";
    const poPrintData = buildPurchaseOrderPrintData(po, lines, storeInfo, supplier);

    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/bisnis/pembelian" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("purchase.create.back")}
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{po.po_no}</h1>
            <p className="text-sm text-slate-500">
              {docStatus === "finished"
                ? t("purchase.detail.poFinished")
                : docStatus === "cancelled"
                  ? t("purchase.detail.poCancelled")
                  : t("purchase.detail.poDraft")}
            </p>
            {ordererName && (
              <p className="mt-1 text-xs text-slate-500">{t("purchase.detail.orderedBy", { name: ordererName })}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${poSt.cls}`}>
              {t(ORDER_STATUS_KEY[docStatus] ?? poSt.label)}
            </span>
            {whSt && (
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${whSt.cls}`}>
                WMS: {whSt.label}
              </span>
            )}
            <button type="button" onClick={() => openBizDocumentPrint(poPrintData)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Printer className="h-4 w-4" /> {t("purchase.detail.printPo")}
            </button>
            {canEditPurchaseOrder(po) && (
              <Link href={`/bisnis/pembelian/buat?po=${po.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> {t("purchase.detail.editPo")}
              </Link>
            )}
            {canCreatePurchaseRetur(po) && linkedBill && (
              <button
                type="button"
                disabled={creatingRetur}
                onClick={() => void handleCreateRetur(po)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
              >
                {creatingRetur ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {t("purchase.detail.createRetur")}
              </button>
            )}
            {canSendWh && (
              <button
                type="button"
                disabled={sendingWarehouse}
                onClick={() => void handleSendToWarehouse()}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
              >
                {sendingWarehouse ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Truck className="h-4 w-4" />
                )}
                {t("purchase.detail.sendReceiving")}
              </button>
            )}
            {linkedBill ? (
              <Link href={`/bisnis/pembelian/${linkedBill.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
                <FileText className="h-4 w-4" /> {t("purchase.detail.viewBill")}
              </Link>
            ) : poEditable && canBill ? (
              <button type="button" disabled={creatingBill} onClick={handleCreateBill}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {creatingBill ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {t("purchase.detail.createBill")}
              </button>
            ) : poEditable && !linkedBill ? (
              <button
                type="button"
                disabled
                title={billBlock ?? undefined}
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
              >
                <FileText className="h-4 w-4" /> {t("purchase.detail.createBill")}
              </button>
            ) : null}
          </div>
        </div>

        {autoReceived && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">Penerimaan & QC selesai otomatis</p>
            <p className="mt-1">
              Barang sesuai estimasi PO — stok sudah diposting dan tagihan dibuat tanpa perlu approval
              bisnis.
            </p>
          </div>
        )}

        <PurchaseQcExceptionPanel po={po} onFinalized={load} />

        {po.send_to_warehouse_at && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              whStatus === "complete"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : whStatus === "hold"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-200 bg-blue-50 text-blue-900"
            }`}
          >
            <div className="flex flex-wrap items-start gap-2">
              <Warehouse className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {t("purchase.detail.whStatusTitle", { status: whSt?.label ?? "—" })}
                </p>
                {processorName && po.warehouse_processed_at && (
                  <p className="mt-1">
                    {t("purchase.detail.processedBy", {
                      name: processorName,
                      date: fmtWarehouseProcessedAt(po.warehouse_processed_at),
                    })}
                  </p>
                )}
                {po.warehouse_hold_note && whStatus === "hold" && (
                  <p className="mt-1 text-amber-800">{t("purchase.detail.whNote", { note: po.warehouse_hold_note })}</p>
                )}
                {whStatus === "complete" && !awaitingBusinessRecv && autoReceived && (
                  <p className="mt-1">Stok dan tagihan sudah diproses otomatis.</p>
                )}
                {whStatus === "complete" && !awaitingBusinessRecv && !autoReceived && (
                  <p className="mt-1">{t("purchase.detail.readyForBill")}</p>
                )}
                {whStatus === "complete" && awaitingBusinessRecv && (
                  <p className="mt-1">{t("purchase.detail.recvHoldBill")}</p>
                )}
                {whStatus !== "complete" && (
                  <Link
                    href={`/gudang/penerimaan/${po.id}`}
                    className="mt-2 inline-block text-xs font-semibold underline"
                  >
                    {t("purchase.detail.viewReceiving")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {poEditable && !linkedBill && !po.send_to_warehouse_at && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            {t("purchase.detail.noWmsHint")}
          </div>
        )}

        {poEditable && !linkedBill && po.send_to_warehouse_at && !canBill && billBlock && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {billBlock}
          </div>
        )}

        <BizDocumentSheet data={poPrintData} />
      </div>
    );
  }

  if (!bill) return null;

  const disp = getPurchaseDisplayStatus(bill);
  const st = PURCHASE_STATUS_UI[disp];
  const cancelled = disp === "cancelled";
  const billPo = linkedPo ?? bill.expand?.purchase_order;
  const billPrintData = buildBillPrintData(bill, lines, storeInfo, supplier, billPo ?? undefined, {
    cancelled,
  });
  const billEntityMismatch =
    bill.company && workCtx?.companyId && bill.company !== workCtx.companyId;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/bisnis/pembelian" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("purchase.create.back")}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{bill.bill_no}</h1>
          <p className="text-sm text-slate-500">{t("purchase.detail.poRef", { no: billPo?.po_no ?? "—" })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>
            {t(PURCHASE_STATUS_KEY[disp] ?? st.label)}
          </span>
          <button
            type="button"
            onClick={() => openBizDocumentPrint(billPrintData)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> {t("purchase.detail.print")}
          </button>
          {!cancelled && disp !== "paid" && (bill.remaining ?? 0) > 0 && (
            <button
              type="button"
              onClick={openPayModal}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <CreditCard className="h-4 w-4" /> Bayar Hutang
            </button>
          )}
          {canEditPurchaseBill(bill) && (
            <Link
              href={`/bisnis/pembelian/buat?edit=${bill.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" /> {t("purchase.detail.edit")}
            </Link>
          )}
          {billPo && canCreatePurchaseRetur(billPo) && !cancelled && (
            <button
              type="button"
              disabled={creatingRetur}
              onClick={() => void handleCreateRetur(billPo)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              {creatingRetur ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {t("purchase.detail.createRetur")}
            </button>
          )}
          {canCancelPurchaseBill(bill) && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50"
            >
              <Ban className="h-4 w-4" /> {t("purchase.detail.cancel")}
            </button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t("purchase.detail.cancelledBanner")}
          {bill.cancel_reason ? (
            <span className="mt-1 block text-slate-500">{t("purchase.detail.cancelReason", { reason: bill.cancel_reason })}</span>
          ) : null}
        </div>
      )}

      {billEntityMismatch && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Tagihan ini milik entitas lain. Pembayaran hanya bisa dari akun kas/bank entitas pemilik tagihan.
        </div>
      )}

      {billPo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-medium text-slate-700">{t("purchase.detail.wmsSection")}</span>
          <WmsRouteBadge order={billPo} kind="purchase" />
          {canSendPurchaseOrderToWarehouse(billPo) && (
            <button
              type="button"
              disabled={sendingWarehouse}
              onClick={() => void handleSendToWarehouse(billPo)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {sendingWarehouse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              {t("purchase.detail.sendReceiving")}
            </button>
          )}
          {billPo.send_to_warehouse_at && (
            <Link
              href={`/gudang/penerimaan/${billPo.id}`}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              {t("purchase.detail.openReceiving")}
            </Link>
          )}
          <Link
            href={`/bisnis/pembelian/${billPo.id}`}
            className="text-xs text-slate-500 hover:text-indigo-600"
          >
            {t("purchase.detail.poLink", { no: billPo.po_no })}
          </Link>
        </div>
      )}

      <BizDocumentSheet data={billPrintData} className={cancelled ? "opacity-75" : ""} />

      {!cancelled && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Pembayaran Hutang
            </h2>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-500">
                Dibayar: <span className="font-semibold text-emerald-600">{fmtRp(bill.paid_amount ?? 0)}</span>
              </span>
              <span className="text-slate-500">
                Sisa: <span className="font-semibold text-red-600">{fmtRp(bill.remaining ?? 0)}</span>
              </span>
            </div>
          </div>
          {billPayments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Belum ada pembayaran tercatat.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {billPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{fmtDate(p.payment_date)}</p>
                    <p className="text-xs text-slate-500">
                      {paymentMethodLabel(paymentMethods, p.payment_method, p.expand?.payment_method)}
                      {p.expand?.cash_account?.name ? ` · ${p.expand.cash_account.name}` : ""}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold text-red-600">−{fmtRp(p.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Bayar Hutang</h2>
              <button onClick={() => setShowPayModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handlePayBill} className="space-y-4 px-6 py-5">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total tagihan</span>
                  <span className="font-semibold text-slate-900">{fmtRp(bill.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sudah dibayar</span>
                  <span className="text-emerald-600">{fmtRp(bill.paid_amount ?? 0)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                  <span className="text-slate-700">Sisa hutang</span>
                  <span className="text-red-600">{fmtRp(bill.remaining ?? 0)}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Jumlah Bayar <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={payForm.amount ? fmtNum(payForm.amount) : ""}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: parseNum(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Bayar</label>
                <input
                  type="date"
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Metode Pembayaran <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Pilih metode</option>
                  {paymentMethods
                    .filter((m) => m.is_active !== false)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
              {cashAccounts.length > 0 ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Sumber Dana (Akun Kas) <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={payForm.cash_account}
                    onChange={(e) => setPayForm((f) => ({ ...f, cash_account: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Pilih akun kas/bank entitas</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">
                    Hanya akun operasional milik entitas pemilik tagihan. Saldo Kas & Bank akan berkurang.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Belum ada akun kas/bank untuk entitas ini.{" "}
                  <Link href="/keuangan/kas-bank" className="font-semibold underline">
                    Tambah di Kas & Bank
                  </Link>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                <input
                  type="text"
                  value={payForm.notes}
                  onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Opsional"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paySubmitting || cashAccounts.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {paySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CancelPurchaseModal
        billNo={bill.bill_no}
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={async (reason) => {
          try {
            await cancelPurchaseBill(bill, reason);
            setShowCancelModal(false);
            await load();
          } catch (e: unknown) {
            alert(getErrorMessage(e, t("purchase.detail.errCancelPurchase")));
          }
        }}
      />
    </div>
  );
}
