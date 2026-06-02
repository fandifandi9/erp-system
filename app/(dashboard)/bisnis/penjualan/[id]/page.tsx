"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Printer, Loader2, X, CheckCircle2,
  Clock, AlertTriangle, CreditCard, Pencil, Ban, FileText,
} from "lucide-react";
import {
  fetchInvoice, fetchSalesOrderLines, fetchPayments,
  createPayment, fetchPaymentMethods, cancelInvoice, syncCashInvoiceStatus, fetchSalesOrder, fetchStores,
  createInvoiceFromSalesOrder,
  fetchInvoiceBySalesOrder,
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
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { Invoice, SalesOrder, SalesOrderLine, PaymentMethodSetting, Store } from "@/lib/bisnis/types";
import type { Payment } from "@/lib/bisnis/client";
import {
  findPaymentMethod,
  paymentMethodLabel,
  paymentMethodRelationId,
} from "@/lib/bisnis/payment-method-value";
import { formatShippingDisplay, parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { formatBankTransferDisplay, parseNotesWithBankTransfer } from "@/lib/bisnis/bank-transfer-notes";
import { marketplaceLabelFromInvoice } from "@/lib/bisnis/mp-invoice-meta";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);
const parseNum = (s: string) => Number(s.replace(/\./g, "").replace(/,/g, ".")) || 0;

const STATUS_ICONS = {
  paid: CheckCircle2,
  unpaid: Clock,
  overdue: AlertTriangle,
  cancelled: X,
} as const;

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

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
  const [payForm, setPayForm] = useState({ amount: 0, payment_method: "", payment_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [storeInfo, setStoreInfo] = useState<Store | null>(null);

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
        if (soId) {
          try {
            soForWms = await fetchSalesOrder(soId);
          } catch {
            /* keep expand */
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
        if (soId) {
          const l = await fetchSalesOrderLines(soId).catch(() => []);
          setLines(l);
        } else {
          setLines([]);
        }
        if (soWarehouse) {
          const st = await fetchStores(false).catch(() => [] as Store[]);
          setStoreInfo(st.find((x) => x.default_warehouse === soWarehouse) ?? null);
        } else {
          setStoreInfo(null);
        }
        const p = await fetchPayments(synced.id);
        setPayments(p);
        const pm = await fetchPaymentMethods().catch(() => []);
        setPaymentMethods(pm);
        return;
      } catch {
        // Bukan id invoice — coba sebagai SO
      }

      const soData = await fetchSalesOrder(id);
      setMode("so");
      setSo(soData);
      setLinkedSo(null);
      setInvoice(null);
      setPayments([]);
      const lb = await fetchInvoiceBySalesOrder(soData.id);
      setLinkedInvoice(lb);
      const l = await fetchSalesOrderLines(soData.id);
      setLines(l);
      if (soData.warehouse) {
        const st = await fetchStores(false).catch(() => [] as Store[]);
        setStoreInfo(st.find((x) => x.default_warehouse === soData.warehouse) ?? null);
      } else {
        setStoreInfo(null);
      }
      await fetchPaymentMethods().catch(() => []).then(setPaymentMethods);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content || !invoice) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoice?.invoice_no}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { margin:0; padding:0; box-sizing:border-box; font-family: Inter, Arial, sans-serif; color:#0f172a; }
        body { background:#fff; padding:8mm; }
        .rounded-xl { border-radius: 12px; }
        .border { border: 0 !important; }
        .border-b { border-bottom: 1px solid #e5eaf2 !important; }
        .border-y { border-top: 1px solid #cfdbf2 !important; border-bottom: 1px solid #cfdbf2 !important; }
        .border-slate-100, .border-slate-200 { border-color:#e5eaf2 !important; }
        .border-indigo-100 { border-color:#cfdbf2 !important; }
        .border-t-indigo-300 { border-top-color:#8ea7d7 !important; }
        .border-t-2 { border-top-width:2px !important; }
        .bg-white, .bg-slate-50 { background:#fff !important; }
        .bg-indigo-50 { background:#eef4ff !important; }
        .shadow-sm { box-shadow:none !important; }
        .px-6 { padding-left:14px !important; padding-right:14px !important; }
        .py-5, .py-4 { padding-top:12px !important; padding-bottom:12px !important; }
        .py-3 { padding-top:9px !important; padding-bottom:9px !important; }
        .grid { display:grid; }
        .sm\\:grid-cols-2 { grid-template-columns: 1fr 1fr; }
        .gap-6 { gap:16px; }
        .text-right { text-align:right; }
        .text-xs { font-size:11px !important; }
        .text-sm { font-size:12px !important; }
        .text-base { font-size:16px !important; }
        .text-lg { font-size:26px !important; }
        .font-bold { font-weight:700; }
        .font-semibold { font-weight:600; }
        .font-medium { font-weight:500; }
        .uppercase { text-transform:uppercase; }
        table { width:100%; border-collapse:collapse; table-layout:fixed; }
        th, td { padding:10px 12px; }
        thead tr { border-bottom:1px solid #e5eaf2; }
        th { font-size:11px; letter-spacing:0.08em; color:#5c6f90; text-transform:uppercase; }
        .text-indigo-700 { color:#314e87 !important; }
        tbody tr { border-bottom:1px solid #ecf1f6; }
        .text-red-600 { color:#dc2626 !important; }
        .text-emerald-600 { color:#059669 !important; }
        .text-indigo-600 { color:#4f46e5 !important; }
        .mt-1 { margin-top:4px; }
        .mt-3 { margin-top:10px; }
        .mt-4 { margin-top:14px; }
        .space-y-1 > * + * { margin-top:4px; }
        .space-y-1\\.5 > * + * { margin-top:6px; }
        .space-y-4 > * + * { margin-top:14px; }
        .ml-auto { margin-left:auto; }
        .max-w-xs { max-width:270px; }
        .flex { display:flex; }
        .justify-between { justify-content:space-between; }
        .items-center { align-items:center; }
        .whitespace-pre-line { white-space:pre-line; }
        .leading-tight { line-height:1.2; }
        .break-words { overflow-wrap:anywhere; word-break:break-word; }
        .bank-box { border:0; background:#f6f9ff; border-radius:8px; padding:10px 12px; }
        .bank-title { font-size:11px; color:#1d4ed8; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
        .rounded-lg { border: 0 !important; background:#fff !important; }
        @media print { body { padding:0; } }
      </style></head><body>`);
    win.document.write(content.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  const openPayModal = () => {
    setPayForm({
      amount: invoice?.remaining ?? 0,
      payment_method: "",
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
      const basePaymentPayload: {
        invoice: string;
        payment_date: string;
        amount: number;
        reference_no: string;
        notes?: string;
        created_by?: string;
      } = {
        invoice: invoice.id,
        payment_date: payForm.payment_date,
        amount: payForm.amount,
        reference_no: "",
        notes: payForm.notes?.trim() || undefined,
      };
      if (userId) basePaymentPayload.created_by = userId;

      await createPayment({
        ...basePaymentPayload,
        payment_method: paymentMethodRelationId(matchedMethod),
      });

      const newPaid = invoice.paid_amount + payForm.amount;
      const newRemaining = invoice.total - newPaid;
      const newStatus = newRemaining <= 0 ? "paid" : invoice.status === "overdue" ? "overdue" : "unpaid";

      await pb.collection(BISNIS_COLLECTIONS.invoices).update(invoice.id, {
        paid_amount: newPaid,
        remaining: Math.max(0, newRemaining),
        status: newStatus,
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
    const rawNotes = so.notes ?? "";
    const { textNotes: notesNoBank, bank } = parseNotesWithBankTransfer(rawNotes);
    const { textNotes, shipping } = parseNotesWithShipping(notesNoBank);
    const shipLabel = formatShippingDisplay(shipping);
    const bankLabel = formatBankTransferDisplay(bank);

    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
              <button type="button" onClick={handlePrint}
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

          {soEditable && !linkedInvoice && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              SO ini belum punya invoice. Klik <strong>Buat Invoice</strong> untuk penagihan + keluarkan stok.
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

          <div ref={printRef} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">SALES ORDER</h2>
                  <p className="mt-1 font-mono text-sm text-indigo-600">{so.order_no}</p>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>Tanggal: <span className="font-medium text-slate-900">{fmtDate(so.order_date)}</span></p>
                    <p>Jatuh tempo: <span className="font-medium text-slate-900">{fmtDate(so.due_date)}</span></p>
                  </div>
                  {storeInfo && (
                    <div className="mt-4 rounded-lg border border-slate-100 border-t-2 border-t-indigo-300 bg-indigo-50 px-3 py-2 text-sm">
                      <p className="text-xs uppercase tracking-wider text-slate-400">Penjual</p>
                      <p className="font-semibold text-slate-900">{storeInfo.name}</p>
                      <p className="text-slate-600">Telp: {storeInfo.phone || "-"}</p>
                      <p className="text-slate-600">Email: {storeInfo.email || "-"}</p>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Pelanggan</p>
                  <p className="mt-1 text-base font-semibold leading-tight text-slate-900 break-words">
                    {so.expand?.customer?.name || "—"}
                  </p>
                  {so.expand?.customer?.email && <p className="text-sm text-slate-500">{so.expand.customer.email}</p>}
                  {so.expand?.customer?.phone && <p className="text-sm text-slate-500">{so.expand.customer.phone}</p>}
                </div>
              </div>
            </div>

            {(shipLabel || bankLabel || textNotes) && (
              <div className="border-b border-slate-100 px-6 py-4 space-y-2 text-sm">
                {shipLabel && <p><span className="font-medium">Pengiriman:</span> {shipLabel}</p>}
                {bankLabel && <p><span className="font-medium">Transfer:</span> {bankLabel}</p>}
                {textNotes && <p className="whitespace-pre-line text-slate-600">{textNotes}</p>}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="border-y border-indigo-100 bg-indigo-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-indigo-700">Produk</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-indigo-700">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-indigo-700">Harga</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-indigo-700">Diskon</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-indigo-700">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-3 font-medium text-slate-900">{l.expand?.product?.name || l.name_snapshot || "—"}</td>
                      <td className="px-4 py-3 text-center text-slate-700">{fmtNum(l.qty)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(l.unit_price)}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{l.discount_percent ? `${l.discount_percent}%` : ""}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-900">{fmt(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-200 px-6 py-5">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmt(so.subtotal)}</span></div>
                {(so.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">Diskon</span><span>-{fmt(so.discount_amount!)}</span></div>
                )}
                {so.tax_amount > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">Pajak</span><span>{fmt(so.tax_amount)}</span></div>
                )}
                {(so.materai_amount ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">Materai</span><span>{fmt(so.materai_amount!)}</span></div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>Total SO</span><span>{fmt(so.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
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
  const methodLabel = (value?: string, expanded?: { name?: string }) =>
    paymentMethodLabel(paymentMethods, value, expanded);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
            <button onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition">
              <Printer className="h-4 w-4" /> Cetak
            </button>
          </div>
        </div>

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

        {linkedSo && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-medium text-slate-700">WMS / Picking</span>
            <WmsRouteBadge order={linkedSo} kind="sales" />
            {canSendSalesOrderToWarehouse(linkedSo) && (
              <button
                type="button"
                disabled={sendingWarehouse}
                onClick={() => void handleSendToWarehouse(linkedSo)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {sendingWarehouse ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Send → Picking
              </button>
            )}
            {linkedSo.send_to_warehouse_at && (
              <Link href="/wms/picking" className="text-xs font-semibold text-indigo-600 hover:underline">
                Buka antrean picking →
              </Link>
            )}
            {linkedSo.order_no && (
              <Link
                href={`/bisnis/penjualan/${linkedSo.id}`}
                className="text-xs text-slate-500 hover:text-indigo-600"
              >
                SO {linkedSo.order_no}
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

        {/* Printable Content */}
        <div ref={printRef}>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* Invoice Header Info */}
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="grid-2 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">INVOICE</h2>
                  <p className="mt-1 font-mono text-sm text-indigo-600">{invoice.invoice_no}</p>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>Tanggal: <span className="font-medium text-slate-900">{fmtDate(invoice.issue_date)}</span></p>
                    <p>
                      {cash ? (
                        <>Pembayaran: <span className="font-medium text-emerald-700">Cash / Lunas</span></>
                      ) : (
                        <>Jatuh tempo: <span className="font-medium text-slate-900">{fmtDate(invoice.due_date)}</span></>
                      )}
                    </p>
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-100 border-t-2 border-t-indigo-300 bg-indigo-50 px-3 py-2 text-sm">
                    <p className="text-xs uppercase tracking-wider text-slate-400">Penjual</p>
                    <p className="font-semibold text-slate-900">{storeInfo?.name || "-"}</p>
                    <p className="text-slate-600">Telp: {storeInfo?.phone || "-"}</p>
                    <p className="text-slate-600">Email: {storeInfo?.email || "-"}</p>
                  </div>
                </div>
                <div className="text-right">
                  {isMpImport ? (
                    <>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Sumber penjualan</p>
                      <p className="mt-1 text-base font-semibold text-violet-900">{mpLabel ?? "Marketplace"}</p>
                      {invoice.mp_order_no && (
                        <p className="text-sm text-slate-600">
                          Order MP: <span className="font-mono">{invoice.mp_order_no}</span>
                        </p>
                      )}
                      {invoice.mp_buyer_name && (
                        <p className="text-sm font-medium text-slate-800">Pembeli: {invoice.mp_buyer_name}</p>
                      )}
                      <p className="mt-3 text-xs uppercase tracking-wider text-slate-400">Kontak pembukuan</p>
                      <p className="text-sm font-medium text-slate-700">{customer?.name || "—"}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wider text-slate-400">Ditagihkan kepada</p>
                      <p className="mt-1 text-base font-semibold leading-tight text-slate-900 break-words">{customer?.name || "—"}</p>
                      {customer?.email && <p className="text-sm text-slate-500">{customer.email}</p>}
                      {customer?.phone && <p className="text-sm text-slate-500">{customer.phone}</p>}
                      {customer?.address && <p className="mt-1 text-sm text-slate-500">{customer.address}</p>}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "40%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="border-y border-indigo-100 bg-indigo-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-indigo-700">Produk</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-indigo-700">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-indigo-700">Harga</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-indigo-700">Diskon</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-indigo-700">Jumlah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const prodName = l.expand?.product?.name || l.name_snapshot || "—";
                    return (
                      <tr key={l.id}>
                        <td className="px-6 py-3 font-medium text-slate-900">{prodName}</td>
                        <td className="px-4 py-3 text-center text-slate-700">{fmtNum(l.qty)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{fmt(l.unit_price)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{l.discount_percent ? `${l.discount_percent}%` : ""}</td>
                        <td className="px-6 py-3 text-right font-medium text-slate-900">{fmt(l.line_total)}</td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Tidak ada item</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="border-t border-slate-200 px-6 py-5">
              <div className="ml-auto max-w-xs space-y-1.5">
                {isCancelled && (
                  <p className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-center text-xs text-slate-600">
                    Invoice dibatalkan — nominal tidak dihitung di laba rugi
                  </p>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-900">{fmt(invoice.subtotal)}</span>
                </div>
                {(invoice.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Diskon</span>
                    <span className="text-red-500">-{fmt(invoice.discount_amount)}</span>
                  </div>
                )}
                {invoice.tax_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">PPN / Pajak</span>
                    <span className="text-slate-900">{fmt(invoice.tax_amount)}</span>
                  </div>
                )}
                {(invoice.materai_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Biaya Materai</span>
                    <span className="text-slate-900">{fmt(invoice.materai_amount!)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                  <span className="text-slate-900">Total</span>
                  <span className="text-slate-900">{fmt(invoice.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Dibayar</span>
                  <span className="text-emerald-600 font-medium">{fmt(invoice.paid_amount)}</span>
                </div>
                {!isCancelled && (
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-slate-700">Sisa tagihan</span>
                    <span className={invoice.remaining > 0 ? "text-red-600" : "text-emerald-600"}>{fmt(invoice.remaining)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes & pengiriman */}
            {(() => {
              const { textNotes: notesNoBank, bank } = parseNotesWithBankTransfer(invoice.notes);
              const { textNotes, shipping } = parseNotesWithShipping(notesNoBank);
              const shipLabel = formatShippingDisplay(shipping);
              const bankLabel = formatBankTransferDisplay(bank);
              if (!textNotes && !shipLabel && !bankLabel) return null;
              return (
                <div className="border-t border-slate-100 px-6 py-4 space-y-4">
                  {bankLabel && (
                    <div className="bank-box">
                      <p className="bank-title">Rekening transfer</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{bankLabel}</p>
                    </div>
                  )}
                  {shipLabel && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Info pengiriman</p>
                      <p className="mt-1 text-sm text-slate-700">{shipLabel}</p>
                    </div>
                  )}
                  {textNotes && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Catatan</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{textNotes}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h3 className="font-semibold text-slate-900">Riwayat Pembayaran</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{fmtDate(p.payment_date)}</p>
                    <p className="text-xs text-slate-500">
                      {methodLabel(p.payment_method, p.expand?.payment_method)}
                      {p.notes ? ` — ${p.notes}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600">+{fmt(p.amount)}</p>
                </div>
              ))}
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
    </div>
  );
}
