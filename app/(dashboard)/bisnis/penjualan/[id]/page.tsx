"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Printer, Loader2, X, CheckCircle2,
  Clock, AlertTriangle, CreditCard, Pencil, Ban, FileText, RotateCcw,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  fetchInvoice, fetchSalesOrderLines, fetchPayments,
  fetchPaymentMethods, cancelInvoice, syncCashInvoiceStatus, fetchSalesOrder,
  createInvoiceFromSalesOrder,
  fetchInvoiceBySalesOrder,
  fetchRetursForSalesOrder,
  canEditSalesOrder,
  getSalesOrderDocStatus,
  ORDER_DOC_STATUS_UI,
  sendSalesOrderToWarehouse,
  canSendSalesOrderToWarehouse,
  canCreateInvoiceFromSalesOrder,
  invoiceBlockedReason,
  getSalesWmsDisplayStatus,
} from "@/lib/bisnis/client";
import { getErrorMessage } from "@/lib/errors";
import { CancelInvoiceModal } from "@/components/bisnis/CancelInvoiceModal";
import {
  INVOICE_STATUS_UI,
  getInvoiceDisplayStatus,
  isCashInvoice,
  canEditInvoice,
  canCancelInvoice,
} from "@/lib/bisnis/invoice-status";
import { pb } from "@/lib/pocketbase";
import { ClientResponseError } from "pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { CashAccount, Invoice, Retur, SalesOrder, SalesOrderLine, PaymentMethodSetting, Store } from "@/lib/bisnis/types";
import type { Payment } from "@/lib/bisnis/client";
import { applyInvoicePayment } from "@/lib/bisnis/invoice-payment";
import { fetchCashAccounts } from "@/lib/bisnis/cash-client";
import { useWorkContext } from "@/components/WorkContextProvider";
import {
  findPaymentMethod,
  paymentMethodLabel,
} from "@/lib/bisnis/payment-method-value";
import { marketplaceLabelFromInvoice } from "@/lib/bisnis/mp-invoice-meta";
import { InvoiceListMetaBadges } from "@/components/bisnis/InvoiceListMetaBadges";
import { BizDocumentSheet } from "@/components/bisnis/BizDocumentSheet";
import { openBizDocumentPrint } from "@/lib/bisnis/doc-print";
import { buildInvoicePrintData, buildSalesOrderPrintData } from "@/lib/bisnis/doc-print-mappers";
import { AwbLabelPanel } from "@/components/bisnis/AwbLabelPanel";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { canShowSalesReturUi, salesReturBlockedHint } from "@/lib/bisnis/sales-retur-ui";
import { returDisplayForSalesOrder } from "@/lib/bisnis/retur-workflow";
import { SalesReturCreateModal } from "@/components/bisnis/SalesReturCreateModal";
import { SalesReturSoSection } from "@/components/bisnis/SalesReturSoSection";
import { getCachedPaymentMethods } from "@/lib/bisnis/master-data-cache";
import { useLocale } from "@/components/LocaleProvider";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/,/g, ".")) || 0;

const SalesDocumentChainSection = dynamic(
  () =>
    import("@/components/bisnis/SalesDocumentChainSection").then((m) => ({
      default: m.SalesDocumentChainSection,
    })),
  {
    ssr: false,
    loading: () => <div className="mb-6 h-24 animate-pulse rounded-xl bg-slate-100" />,
  },
);

function findOpenReturFromList(returs: Retur[]): Retur | null {
  return (
    returs.find((r) => r.status === "draft" || r.status === "approved") ?? null
  );
}

const STATUS_ICONS = {
  paid: CheckCircle2,
  unpaid: Clock,
  overdue: AlertTriangle,
  cancelled: X,
} as const;

function OpenReturBanner({ retur, t }: { retur: Retur; t: (key: string) => string }) {
  const disp = returDisplayForSalesOrder(retur);
  const wmsPending = disp.labelId === "sales.returStatus.awaitingWms";
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
        wmsPending ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900"
      }`}
    >
      <p className="font-semibold">
        {t(disp.labelId)} — {retur.retur_no}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
        {(retur.sales_order || retur.reference_id) ? (
          <Link
            href={`/bisnis/penjualan/${retur.sales_order || retur.reference_id}`}
            className="text-indigo-700 hover:underline"
          >
            Lihat di SO →
          </Link>
        ) : null}
        <Link href={`/bisnis/retur/${retur.id}`} className="text-indigo-700 hover:underline">
          Detail retur →
        </Link>
        {wmsPending ? (
          <Link href={`/gudang/penerimaan/retur/${retur.id}`} className="text-violet-700 hover:underline">
            Buka di WMS →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const router = useRouter();
  const { context: workCtx, stores: workStores } = useWorkContext();
  const [mode, setMode] = useState<"invoice" | "so">("invoice");
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [linkedSo, setLinkedSo] = useState<SalesOrder | null>(null);
  const [linkedInvoice, setLinkedInvoice] = useState<Invoice | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [sendingWarehouse, setSendingWarehouse] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<SalesOrderLine[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [payForm, setPayForm] = useState({ amount: 0, fee_amount: 0, payment_method: "", cash_account: "", payment_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [storeInfo, setStoreInfo] = useState<Store | null>(null);
  const [openRetur, setOpenRetur] = useState<Retur | null>(null);
  const [retursHistory, setRetursHistory] = useState<Retur[]>([]);
  const [returModalSo, setReturModalSo] = useState<SalesOrder | null>(null);
  const [chainRefreshKey, setChainRefreshKey] = useState(0);
  const [chainEnabled, setChainEnabled] = useState(false);

  const resolveStoreInfo = useCallback(
    (warehouseId?: string) => {
      if (!warehouseId) return null;
      return workStores.find((x) => x.default_warehouse === warehouseId) ?? null;
    },
    [workStores],
  );

  useEffect(() => {
    if (!loading && (invoice || so)) {
      const frame = requestAnimationFrame(() => setChainEnabled(true));
      return () => cancelAnimationFrame(frame);
    }
    setChainEnabled(false);
    return undefined;
  }, [loading, invoice, so]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        const inv = await fetchInvoice(id);
        const synced = await syncCashInvoiceStatus(inv);
        setMode("invoice");
        setInvoice(synced);
        setSo(null);
        setLinkedInvoice(null);

        const soId = synced.sales_order;
        let soForWms: SalesOrder | null = synced.expand?.sales_order ?? null;
        if (soId && !soForWms) {
          try {
            soForWms = await fetchSalesOrder(soId);
          } catch {
            /* keep null */
          }
        }
        setLinkedSo(soForWms);

        const disp = getInvoiceDisplayStatus(synced);
        if (disp === "unpaid" && synced.due_date && !isCashInvoice(synced)) {
          const due = new Date(synced.due_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          due.setHours(0, 0, 0, 0);
          if (due < today) {
            await pb.collection(BISNIS_COLLECTIONS.invoices).update(synced.id, { status: "overdue" });
            setInvoice({ ...synced, status: "overdue" });
          }
        }

        const soWarehouse = soForWms?.warehouse ?? synced.expand?.sales_order?.warehouse;
        setStoreInfo(resolveStoreInfo(soWarehouse) as Store | null);

        const [l, p, pm, returs] = await Promise.all([
          soId ? fetchSalesOrderLines(soId).catch(() => []) : Promise.resolve([] as SalesOrderLine[]),
          fetchPayments(synced.id),
          getCachedPaymentMethods(() => fetchPaymentMethods().catch(() => [])),
          soId ? fetchRetursForSalesOrder(soId).catch(() => []) : Promise.resolve([] as Retur[]),
        ]);
        setLines(l);
        setPayments(p);
        setPaymentMethods(pm);
        setRetursHistory(returs);
        setOpenRetur(findOpenReturFromList(returs));
        setChainRefreshKey((k) => k + 1);
        return;
      } catch (e) {
        const isMissing =
          e instanceof ClientResponseError && e.status === 404;
        if (!isMissing) throw e;
      }

      const soData = await fetchSalesOrder(id);
      const linkedInv = await fetchInvoiceBySalesOrder(soData.id);
      if (linkedInv) {
        router.replace(`/bisnis/penjualan/${linkedInv.id}`);
        return;
      }
      setMode("so");
      setSo(soData);
      setLinkedSo(null);
      setInvoice(null);
      setPayments([]);
      setLinkedInvoice(null);

      const [l, returs, pm, cashAccts] = await Promise.all([
        fetchSalesOrderLines(soData.id),
        fetchRetursForSalesOrder(soData.id).catch(() => [] as Retur[]),
        getCachedPaymentMethods(() => fetchPaymentMethods().catch(() => [])),
        fetchCashAccounts(true, workCtx?.companyId).catch(() => [] as CashAccount[]),
      ]);
      setLines(l);
      setRetursHistory(returs);
      setOpenRetur(findOpenReturFromList(returs));
      setPaymentMethods(pm);
      setCashAccounts(cashAccts);
      setStoreInfo(resolveStoreInfo(soData.warehouse) as Store | null);
      setChainRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Gagal memuat data"));
    } finally {
      setLoading(false);
    }
  }, [id, router, workCtx?.companyId, resolveStoreInfo]);

  useEffect(() => { load(); }, [load]);

  const openPayModal = () => {
    setPayForm({
      amount: invoice?.remaining ?? 0,
      fee_amount: 0,
      payment_method: "",
      cash_account: "",
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setShowPayModal(true);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || payForm.amount <= 0) return;
    const selectedMethod = payForm.payment_method.trim();
    if (!selectedMethod) {
      alert("Metode pembayaran wajib dipilih");
      return;
    }
    const matchedMethod = findPaymentMethod(paymentMethods, selectedMethod);
    if (!matchedMethod) {
      alert("Metode pembayaran tidak ditemukan di master Metode Bayar");
      return;
    }
    setPaySubmitting(true);
    try {
      const userId = pb.authStore.model?.id || invoice.created_by || "";
      await applyInvoicePayment({
        invoice,
        amount: payForm.amount,
        feeAmount: payForm.fee_amount || undefined,
        paymentDate: payForm.payment_date,
        paymentMethod: matchedMethod,
        cashAccountId: payForm.cash_account || undefined,
        notes: payForm.notes,
        createdBy: userId,
      });

      setShowPayModal(false);
      load();
    } catch (err: unknown) {
      const pbErr = err as { message?: string; response?: { data?: Record<string, unknown> } };
      const detail = pbErr?.response?.data ? JSON.stringify(pbErr.response.data) : "";
      alert(detail || pbErr?.message || "Gagal menyimpan pembayaran");
    } finally {
      setPaySubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
    </div>
  );

  if (error || (!invoice && !so)) return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center">
      <p className="text-red-600">{error || "Tidak ditemukan"}</p>
      <Link href="/bisnis/penjualan" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Kembali</Link>
    </div>
  );

  const handleCreateInvoice = async () => {
    if (!so) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert("Silakan login ulang");
      return;
    }
    setCreatingInvoice(true);
    try {
      const inv = await createInvoiceFromSalesOrder(so.id, userId);
      router.push(`/bisnis/penjualan/${inv.id}`);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membuat invoice"));
    } finally {
      setCreatingInvoice(false);
    }
  };

  const handleCreateRetur = (targetSo: SalesOrder) => {
    setReturModalSo(targetSo);
  };

  const onReturCreated = () => {
    setReturModalSo(null);
    void load();
  };

  const handleSendToWarehouse = async (target?: SalesOrder | null) => {
    const row = target ?? so ?? linkedSo;
    if (!row) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert("Silakan login ulang");
      return;
    }
    setSendingWarehouse(true);
    try {
      await sendSalesOrderToWarehouse(row.id, userId);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal mengirim SO ke picking"));
    } finally {
      setSendingWarehouse(false);
    }
  };

  if (mode === "so" && so) {
    const docStatus = getSalesOrderDocStatus(so);
    const soSt = ORDER_DOC_STATUS_UI[docStatus];
    const soEditable = canEditSalesOrder(so);
    const whSt = getSalesWmsDisplayStatus(so);
    const canSendWh = canSendSalesOrderToWarehouse(so);
    const canInvoice = canCreateInvoiceFromSalesOrder(so);
    const invoiceBlock = invoiceBlockedReason(so);
    const canRetur = canShowSalesReturUi({
      salesOrder: so,
      invoice: linkedInvoice,
      hasInvoice: !!linkedInvoice,
    });
    const returHint = salesReturBlockedHint({
      salesOrder: so,
      invoice: linkedInvoice,
      hasInvoice: !!linkedInvoice,
    });
    const soPrintData = buildSalesOrderPrintData(so, lines, storeInfo);

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Link href="/bisnis/penjualan" className="mb-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Penjualan
          </Link>

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{so.order_no}</h1>
              <p className="text-sm text-slate-500">
                {docStatus === "finished"
                  ? "SO selesai — sudah jadi invoice penjualan"
                  : docStatus === "cancelled"
                    ? "SO dibatalkan"
                    : "Sales Order — belum jadi invoice"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${soSt.cls}`}>{soSt.label}</span>
              {whSt && (
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${whSt.cls}`}>
                  WMS: {whSt.label}
                </span>
              )}
              <button type="button" onClick={() => openBizDocumentPrint(soPrintData)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Printer className="h-4 w-4" /> Cetak SO
              </button>
              {canEditSalesOrder(so) && (
                <Link href={`/bisnis/penjualan/buat?so=${so.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  <Pencil className="h-4 w-4" /> Edit SO
                </Link>
              )}
              {canSendWh && (
                <button
                  type="button"
                  disabled={sendingWarehouse}
                  onClick={() => void handleSendToWarehouse()}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                >
                  {sendingWarehouse ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Send → Picking
                </button>
              )}
              {canRetur && !openRetur && (
                <button
                  type="button"
                  onClick={() => handleCreateRetur(so)}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  Buat Retur
                </button>
              )}
              {linkedInvoice ? (
                <Link href={`/bisnis/penjualan/${linkedInvoice.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
                  <FileText className="h-4 w-4" /> Lihat Invoice
                </Link>
              ) : soEditable && canInvoice ? (
                <button type="button" disabled={creatingInvoice} onClick={handleCreateInvoice}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                  {creatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Buat Invoice
                </button>
              ) : soEditable && !linkedInvoice ? (
                <button
                  type="button"
                  disabled
                  title={invoiceBlock ?? undefined}
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
                >
                  <FileText className="h-4 w-4" />
                  Buat Invoice
                </button>
              ) : null}
            </div>
          </div>

          <SalesReturSoSection
            salesOrderId={so.id}
            openRetur={openRetur}
            returs={retursHistory}
            onRefresh={() => void load()}
          />

          {chainEnabled ? (
            <div className="mb-6">
              <SalesDocumentChainSection
                invoice={linkedInvoice}
                salesOrder={so}
                lines={lines}
                payments={[]}
                returs={retursHistory}
                enabled={chainEnabled}
                onRefreshKey={chainRefreshKey}
              />
            </div>
          ) : null}

          {soEditable && !linkedInvoice && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              SO ini belum punya invoice. Klik <strong>Buat Invoice</strong> untuk penagihan + keluarkan stok.
              {returHint && !linkedInvoice ? (
                <span className="mt-1 block text-amber-800">{returHint}</span>
              ) : null}
              {so.send_to_warehouse_at && !canInvoice && invoiceBlock && (
                <span className="mt-1 block text-amber-800">{invoiceBlock}</span>
              )}
            </div>
          )}
          {soEditable && !linkedInvoice && !so.send_to_warehouse_at && (
            <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              Tanpa WMS: invoice bisa dibuat kapan saja. Centang lewat gudang saat buat SO, atau klik{" "}
              <strong>Send → Picking</strong> untuk antrean WMS (invoice setelah gudang selesai).
            </div>
          )}

          {parseNotesWithShipping(so.notes).shipping.enabled && (
            <div className="mb-4">
              <AwbLabelPanel salesOrderId={so.id} />
            </div>
          )}

          <BizDocumentSheet data={soPrintData} />
        </div>
        {returModalSo ? (
          <SalesReturCreateModal
            open
            salesOrder={returModalSo}
            onClose={() => setReturModalSo(null)}
            onCreated={onReturCreated}
          />
        ) : null}
      </div>
    );
  }

  if (!invoice) return null;

  const disp = getInvoiceDisplayStatus(invoice);
  const st = INVOICE_STATUS_UI[disp];
  const StatusIcon = STATUS_ICONS[disp];
  const customer = invoice.expand?.customer;
  const isMpImport = invoice.source === "marketplace_import";
  const mpLabel = marketplaceLabelFromInvoice(invoice);
  const isOverdue = disp === "overdue";
  const isPaid = disp === "paid";
  const isCancelled = disp === "cancelled";
  const cash = isCashInvoice(invoice);
  const invoicePrintData = buildInvoicePrintData(invoice, lines, storeInfo, {
    cancelled: isCancelled,
  });
  const methodLabel = (value?: string, expanded?: { name?: string }) =>
    paymentMethodLabel(paymentMethods, value, expanded);
  const invoiceCanRetur =
    linkedSo &&
    canShowSalesReturUi({ salesOrder: linkedSo, invoice, hasInvoice: true }) &&
    !isCancelled &&
    !openRetur;
  const invoiceReturHint =
    linkedSo && !invoiceCanRetur && !openRetur && !isCancelled
      ? salesReturBlockedHint({ salesOrder: linkedSo, invoice, hasInvoice: true })
      : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/bisnis/penjualan" className="mb-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700">
              <ArrowLeft className="h-3.5 w-3.5" /> Penjualan
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">{invoice.invoice_no}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditInvoice(invoice) && (
              <Link href={`/bisnis/penjualan/buat?edit=${invoice.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            )}
            {invoiceCanRetur ? (
              <button
                type="button"
                onClick={() => handleCreateRetur(linkedSo!)}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 shadow-sm hover:bg-amber-100 transition"
              >
                <RotateCcw className="h-4 w-4" />
                Buat Retur
              </button>
            ) : null}
            {canCancelInvoice(invoice) && (
              <button type="button" onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 transition">
                <Ban className="h-4 w-4" /> Batalkan
              </button>
            )}
            {!isPaid && !isCancelled && (
              <button onClick={openPayModal}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition">
                <CreditCard className="h-4 w-4" /> Terima Pembayaran
              </button>
            )}
            <button type="button" onClick={() => openBizDocumentPrint(invoicePrintData)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
              <Printer className="h-4 w-4" /> Cetak
            </button>
          </div>
        </div>

        <SalesReturSoSection
          salesOrderId={linkedSo?.id ?? invoice.sales_order ?? ""}
          openRetur={openRetur}
          returs={retursHistory}
          onRefresh={() => void load()}
        />

        {invoiceReturHint ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {invoiceReturHint}
          </div>
        ) : null}

        {/* Status Banner */}
        <div className={`mb-6 flex items-center gap-3 rounded-xl border px-5 py-4 ${st.bannerCls}`}>
          <StatusIcon className={`h-5 w-5 ${st.bannerText}`} />
          <div>
            <p className={`font-semibold ${st.bannerText}`}>{st.label}</p>
            {isCancelled && (
              <p className="text-xs text-slate-500">
                Dibatalkan — tidak masuk laba rugi
                {invoice.cancel_reason ? ` · ${invoice.cancel_reason}` : ""}
              </p>
            )}
            {cash && isPaid && <p className="text-xs text-emerald-600">Pembayaran cash — lunas langsung</p>}
            {isOverdue && !cash && <p className="text-xs text-red-600">Jatuh tempo {fmtDate(invoice.due_date)}</p>}
            {isPaid && !cash && <p className="text-xs text-emerald-600">Dibayar penuh</p>}
            {!isPaid && !isOverdue && !isCancelled && !cash && invoice.due_date && (
              <p className="text-xs text-slate-500">Jatuh tempo {fmtDate(invoice.due_date)}</p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-500">{isCancelled ? "Total (arsip)" : "Sisa tagihan"}</p>
            <p className={`text-lg font-bold ${isCancelled ? "text-slate-500" : isPaid ? "text-emerald-700" : "text-slate-900"}`}>
              {isCancelled ? fmt(invoice.total) : fmt(invoice.remaining)}
            </p>
          </div>
        </div>

        {isCancelled && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Invoice terkunci — hanya bisa dilihat dan dicetak, tidak bisa diedit.
          </div>
        )}

        {chainEnabled ? (
          <div className="mb-6">
            <SalesDocumentChainSection
              invoice={invoice}
              salesOrder={linkedSo}
              lines={lines}
              payments={payments}
              returs={retursHistory}
              enabled={chainEnabled}
              onRefreshKey={chainRefreshKey}
            />
          </div>
        ) : null}

        {linkedSo && parseNotesWithShipping(linkedSo.notes).shipping.enabled && (
          <div className="mb-4">
            <AwbLabelPanel salesOrderId={linkedSo.id} />
          </div>
        )}

        {linkedSo && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700">Alur penjualan</span>
              <InvoiceListMetaBadges invoice={invoice} salesOrder={linkedSo} />
            </div>
            {linkedSo.order_no && (
              <Link
                href={`/bisnis/penjualan/${linkedSo.id}`}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Detail SO / proses gudang →
              </Link>
            )}
          </div>
        )}

        {isMpImport && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
            <p className="font-semibold">Penjualan via marketplace</p>
            {mpLabel && <p className="mt-1">Channel: {mpLabel}</p>}
            {invoice.mp_order_no && (
              <p>No. pesanan MP: <span className="font-mono font-medium">{invoice.mp_order_no}</span></p>
            )}
            {invoice.mp_buyer_name && (
              <p>Pembeli (dari MP): <span className="font-medium">{invoice.mp_buyer_name}</span></p>
            )}
            <p className="mt-2 text-xs text-violet-800">
              &quot;Ditagihkan kepada&quot; di bawah = kontak pembukuan ({customer?.name}), bukan nama pembeli di Shopee/Tokopedia.
            </p>
          </div>
        )}

        <BizDocumentSheet data={invoicePrintData} />

        {/* Payment History */}
        {payments.length > 0 && (
          <div id="payments" className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="font-semibold text-slate-900">Riwayat Pembayaran</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {payments.map((p) => {
                const isRefund =
                  p.payment_kind === "refund" || (p.notes ?? "").includes("[REFUND]");
                return (
                  <div key={p.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {fmtDate(p.payment_date)}
                        {isRefund && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            Refund
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {methodLabel(p.payment_method, p.expand?.payment_method)}
                        {p.reference_no ? ` · ${p.reference_no}` : ""}
                        {p.notes ? ` — ${p.notes}` : ""}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold ${isRefund ? "text-amber-700" : "text-emerald-600"}`}>
                      {isRefund ? "−" : "+"}
                      {fmt(p.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CancelInvoiceModal
        invoiceNo={invoice.invoice_no}
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={async (reason) => {
          await cancelInvoice(invoice, reason);
          load();
        }}
      />

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Terima Pembayaran</h2>
              <button onClick={() => setShowPayModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handlePayment} className="px-6 py-5 space-y-4">
              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Total tagihan</span>
                  <span className="font-semibold text-slate-900">{fmt(invoice.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sudah dibayar</span>
                  <span className="text-emerald-600">{fmt(invoice.paid_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-slate-200 pt-2 mt-2">
                  <span className="text-slate-700">Sisa</span>
                  <span className="text-red-600">{fmt(invoice.remaining)}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Jumlah Bayar <span className="text-red-500">*</span></label>
                <input type="text" inputMode="numeric" required
                  value={payForm.amount ? fmtNum(payForm.amount) : ""}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: parseNum(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Fee / Denda Pelunasan</label>
                <input type="text" inputMode="numeric"
                  value={payForm.fee_amount ? fmtNum(payForm.fee_amount) : ""}
                  onChange={(e) => setPayForm((f) => ({ ...f, fee_amount: Math.max(0, parseNum(e.target.value)) }))}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                <p className="mt-1 text-xs text-slate-400">Tidak mengurangi piutang — dicatat sebagai Pendapatan Lain-lain bulan ini.</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Bayar</label>
                <input type="date" value={payForm.payment_date}
                  onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Metode Pembayaran</label>
                <select value={payForm.payment_method} onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
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
              {cashAccounts.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Masuk ke Akun Kas</label>
                  <select value={payForm.cash_account} onChange={(e) => setPayForm((f) => ({ ...f, cash_account: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="">— Tanpa akun kas —</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.code})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-400">Pilih akun agar saldo Kas & Bank ikut bertambah.</p>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
                <input type="text" value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Opsional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowPayModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Batal</button>
                <button type="submit" disabled={paySubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                  {paySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {returModalSo ? (
        <SalesReturCreateModal
          open
          salesOrder={returModalSo}
          onClose={() => setReturModalSo(null)}
          onCreated={onReturCreated}
        />
      ) : null}
    </div>
  );
}
