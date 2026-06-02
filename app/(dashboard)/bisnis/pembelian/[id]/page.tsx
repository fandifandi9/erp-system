"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, Ban, Printer, FileText, Truck, Warehouse } from "lucide-react";
import {
  fetchPurchaseBill,
  fetchPurchaseOrder,
  fetchPurchaseOrderLines,
  cancelPurchaseBill,
  fetchStores,
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
} from "@/lib/bisnis/client";
import { pb } from "@/lib/pocketbase";
import {
  PURCHASE_STATUS_UI,
  getPurchaseDisplayStatus,
  isCashPurchase,
  canEditPurchaseBill,
  canCancelPurchaseBill,
} from "@/lib/bisnis/purchase-status";
import { CancelPurchaseModal } from "@/components/bisnis/CancelPurchaseModal";
import type { PurchaseBill, PurchaseOrder, PurchaseOrderLine } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { formatShippingDisplay, parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import type { Store } from "@/lib/bisnis/types";
import { WmsRouteBadge } from "@/components/bisnis/WmsRouteBadge";

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);
const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";
const fmtNum = (v: number) => new Intl.NumberFormat("id-ID").format(v);

export default function PembelianDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
  const [storeInfo, setStoreInfo] = useState<Store | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        const b = await fetchPurchaseBill(id);
        setMode("bill");
        setBill(b);
        setPo(null);
        setLinkedBill(null);
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
          const st = await fetchStores(false).catch(() => [] as Store[]);
          setStoreInfo(st.find((x) => x.default_warehouse === wh) ?? null);
        } else {
          setStoreInfo(null);
        }
        return;
      } catch {
        // Bukan id tagihan — coba sebagai PO
      }

      const poData = await fetchPurchaseOrder(id);
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
        const st = await fetchStores(false).catch(() => [] as Store[]);
        setStoreInfo(st.find((x) => x.default_warehouse === wh) ?? null);
      } else {
        setStoreInfo(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
        <p className="text-red-600">{error || "Tidak ditemukan"}</p>
        <Link href="/bisnis/pembelian" className="mt-4 inline-block text-sm text-indigo-600">
          Kembali
        </Link>
      </div>
    );
  }

  const activePo = mode === "po" ? po : bill?.expand?.purchase_order;
  const supplierName =
    mode === "po" ? po?.expand?.supplier?.name : bill?.expand?.supplier?.name;
  const supplier = mode === "po" ? po?.expand?.supplier : bill?.expand?.supplier;
  const wh = activePo?.expand?.warehouse ?? (mode === "po" ? po?.expand?.warehouse : undefined);
  const notesRaw = mode === "po" ? po?.notes : (bill?.notes ?? activePo?.notes);
  const { textNotes, shipping } = parseNotesWithShipping(notesRaw);
  const shipLabel = formatShippingDisplay(shipping);

  const handleCreateBill = async () => {
    if (!po) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert("Silakan login ulang");
      return;
    }
    if (!canCreateBillFromPurchaseOrder(po)) {
      alert(billBlockedReason(po) ?? "PO belum siap untuk tagihan.");
      return;
    }
    setCreatingBill(true);
    try {
      const newBill = await createBillFromPurchaseOrder(po.id, userId);
      router.push(`/bisnis/pembelian/${newBill.id}`);
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal membuat tagihan dari PO"));
    } finally {
      setCreatingBill(false);
    }
  };

  const handleSendToWarehouse = async (target?: PurchaseOrder | null) => {
    const row = target ?? po ?? linkedPo ?? null;
    if (!row) return;
    const userId = pb.authStore.model?.id as string | undefined;
    if (!userId) {
      alert("Silakan login ulang");
      return;
    }
    setSendingWarehouse(true);
    try {
      await sendPurchaseOrderToWarehouse(row.id, userId);
      await load();
    } catch (e: unknown) {
      alert(getErrorMessage(e, "Gagal mengirim PO ke gudang"));
    } finally {
      setSendingWarehouse(false);
    }
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = lines.slice(0, 12).map((l, i) => `
      <tr><td>${i + 1}</td><td>${l.expand?.product?.name ?? "-"}</td><td class="center">${fmtNum(l.qty)}</td><td class="right">${fmt(l.unit_cost)}</td><td class="right">${fmt(l.line_total)}</td></tr>
    `).join("");
    const filler = Array.from({ length: Math.max(0, 12 - lines.length) }).map((_, i) =>
      `<tr><td>${lines.length + i + 1}</td><td>&nbsp;</td><td></td><td></td><td></td></tr>`
    ).join("");
    const dueDate = mode === "bill" && bill ? bill.due_date : po?.expected_date;
    const docDate = mode === "bill" && bill ? bill.bill_date : po?.order_date;
    const docNo = activePo?.po_no ?? bill?.bill_no ?? "-";
    win.document.write(`<!DOCTYPE html><html><head><title>PO ${docNo}</title>
      <style>
        * { box-sizing:border-box; font-family:Arial,sans-serif; }
        body { margin:0; padding:16px; color:#111827; font-size:12px; }
        .sheet { border:1px solid #1e3a8a; }
        .blue { background:#1e3a8a; color:white; font-weight:700; font-size:11px; text-transform:uppercase; }
        .header { display:grid; grid-template-columns:1.1fr 0.9fr; border-bottom:1px solid #1e3a8a; }
        .box { border:1px solid #1e3a8a; padding:6px; }
        .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:6px; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #1e3a8a; padding:4px 6px; font-size:11px; }
        .right { text-align:right; } .center { text-align:center; } .muted { color:#4b5563; }
      </style></head><body>
      <div class="sheet">
        <div class="header">
          <div class="box">
            <div style="font-weight:700;">${storeInfo?.name || "Nama Toko"}</div>
            <div class="muted">${storeInfo?.address || "-"}</div>
            <div class="muted">Telp: ${storeInfo?.phone || "-"}</div>
            <div class="muted">Email: -</div>
          </div>
          <div class="box">
            <div style="font-size:18px;font-weight:700;text-align:right;">PURCHASE ORDER</div>
            <div class="right">No: ${docNo}</div>
            <div class="right">Tanggal: ${fmtDate(docDate)}</div>
            <div class="right">Jatuh tempo: ${fmtDate(dueDate)}</div>
          </div>
        </div>
        <div class="grid2">
          <div class="box">
            <div class="blue" style="margin:-6px -6px 6px -6px;padding:4px 6px;">Supplier</div>
            <div>${supplierName || "-"}</div>
            <div class="muted">${supplier?.address || "-"}</div>
            <div class="muted">Phone: ${supplier?.phone || "-"}</div>
            <div class="muted">Email: ${supplier?.email || "-"}</div>
          </div>
          <div class="box">
            <div class="blue" style="margin:-6px -6px 6px -6px;padding:4px 6px;">Pengiriman</div>
            <div>${shipLabel || "-"}</div>
            <div style="margin-top:6px;" class="muted">Dokumen: ${mode === "po" ? "PO (belum tagihan)" : "Tagihan pembelian"}</div>
          </div>
        </div>
        <table>
          <thead><tr class="blue"><th style="width:36px">No</th><th>Nama Produk</th><th class="center" style="width:90px">Qty</th><th class="right" style="width:130px">Harga</th><th class="right" style="width:130px">Total</th></tr></thead>
          <tbody>${rows}${filler}</tbody>
        </table>
      </div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
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

    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/bisnis/pembelian" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Pembelian
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{po.po_no}</h1>
            <p className="text-sm text-slate-500">
              {docStatus === "finished"
                ? "PO selesai — sudah jadi tagihan pembelian"
                : docStatus === "cancelled"
                  ? "PO dibatalkan"
                  : "Purchase Order — belum jadi tagihan"}
            </p>
            {ordererName && (
              <p className="mt-1 text-xs text-slate-500">Pemesan: {ordererName}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${poSt.cls}`}>{poSt.label}</span>
            {whSt && (
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${whSt.cls}`}>
                WMS: {whSt.label}
              </span>
            )}
            <button type="button" onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <Printer className="h-4 w-4" /> Cetak PO
            </button>
            {canEditPurchaseOrder(po) && (
              <Link href={`/bisnis/pembelian/buat?po=${po.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> Edit PO
              </Link>
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
                Send → Receiving
              </button>
            )}
            {linkedBill ? (
              <Link href={`/bisnis/pembelian/${linkedBill.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
                <FileText className="h-4 w-4" /> Lihat Tagihan
              </Link>
            ) : poEditable && canBill ? (
              <button type="button" disabled={creatingBill} onClick={handleCreateBill}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {creatingBill ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Buat Tagihan
              </button>
            ) : poEditable && !linkedBill ? (
              <button
                type="button"
                disabled
                title={billBlock ?? undefined}
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
              >
                <FileText className="h-4 w-4" /> Buat Tagihan
              </button>
            ) : null}
          </div>
        </div>

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
                  Status proses gudang: {whSt?.label ?? "—"}
                </p>
                {processorName && po.warehouse_processed_at && (
                  <p className="mt-1">
                    Diproses oleh <strong>{processorName}</strong> —{" "}
                    {fmtWarehouseProcessedAt(po.warehouse_processed_at)}
                  </p>
                )}
                {po.warehouse_hold_note && whStatus === "hold" && (
                  <p className="mt-1 text-amber-800">Catatan: {po.warehouse_hold_note}</p>
                )}
                {whStatus === "complete" && (
                  <p className="mt-1">Siap dibuat tagihan (BILL).</p>
                )}
                {whStatus !== "complete" && (
                  <Link
                    href={`/gudang/penerimaan/${po.id}`}
                    className="mt-2 inline-block text-xs font-semibold underline"
                  >
                    Lihat di daftar penerimaan gudang →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {poEditable && !linkedBill && !po.send_to_warehouse_at && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            Tanpa WMS: tagihan (BILL) bisa dibuat manual kapan saja dari tombol{" "}
            <strong>Buat Tagihan</strong>. Lewat WMS: kirim ke penerimaan dulu, tagihan setelah status{" "}
            <strong>Komplit</strong>.
          </div>
        )}

        {poEditable && !linkedBill && po.send_to_warehouse_at && !canBill && billBlock && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {billBlock}
          </div>
        )}

        <PoDetailBody
          supplierName={supplierName}
          whName={wh?.name}
          orderDate={po.order_date}
          dueDate={po.expected_date}
          shipLabel={shipLabel}
          textNotes={textNotes}
          lines={lines}
          subtotal={po.subtotal}
          tax={po.tax_amount}
          total={po.total}
        />
      </div>
    );
  }

  if (!bill) return null;

  const disp = getPurchaseDisplayStatus(bill);
  const st = PURCHASE_STATUS_UI[disp];
  const cash = isCashPurchase(bill);
  const cancelled = disp === "cancelled";
  const billPo = linkedPo ?? bill.expand?.purchase_order;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/bisnis/pembelian" className="mb-4 inline-flex items-center gap-1 text-sm text-indigo-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Pembelian
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{bill.bill_no}</h1>
          <p className="text-sm text-slate-500">PO: {billPo?.po_no ?? "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${st.cls}`}>{st.label}</span>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Cetak
          </button>
          {canEditPurchaseBill(bill) && (
            <Link
              href={`/bisnis/pembelian/buat?edit=${bill.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          {canCancelPurchaseBill(bill) && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50"
            >
              <Ban className="h-4 w-4" /> Batalkan
            </button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Pembelian dibatalkan — hanya bisa dilihat, tidak bisa diedit.
          {bill.cancel_reason ? (
            <span className="mt-1 block text-slate-500">Alasan: {bill.cancel_reason}</span>
          ) : null}
        </div>
      )}

      {billPo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-medium text-slate-700">WMS / Penerimaan</span>
          <WmsRouteBadge order={billPo} kind="purchase" />
          {canSendPurchaseOrderToWarehouse(billPo) && (
            <button
              type="button"
              disabled={sendingWarehouse}
              onClick={() => void handleSendToWarehouse(billPo)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {sendingWarehouse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Send → Receiving
            </button>
          )}
          {billPo.send_to_warehouse_at && (
            <Link
              href={`/gudang/penerimaan/${billPo.id}`}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Buka penerimaan gudang →
            </Link>
          )}
          <Link
            href={`/bisnis/pembelian/${billPo.id}`}
            className="text-xs text-slate-500 hover:text-indigo-600"
          >
            PO {billPo.po_no}
          </Link>
        </div>
      )}

      <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${cancelled ? "opacity-75" : ""}`}>
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-slate-500">Supplier</p>
            <p className="font-medium">{bill.expand?.supplier?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Gudang (stok masuk)</p>
            <p className="font-medium">{wh?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Tanggal</p>
            <p className="font-medium">{fmtDate(bill.bill_date)}</p>
          </div>
          <div>
            <p className="text-slate-500">Jatuh tempo</p>
            <p className="font-medium">{cash ? "Cash / Lunas" : fmtDate(bill.due_date)}</p>
          </div>
        </div>

        {(shipLabel || textNotes) && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
            {shipLabel && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Info pengiriman</p>
                <p className="mt-0.5 text-slate-700">{shipLabel}</p>
              </div>
            )}
            {textNotes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan</p>
                <p className="mt-0.5 whitespace-pre-line text-slate-600">{textNotes}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Produk</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-right">Harga beli</th>
                <th className="px-3 py-2 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="px-3 py-2">{l.expand?.product?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-center">{fmtNum(l.qty)}</td>
                  <td className="px-3 py-2 text-right">{fmt(l.unit_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(l.line_total)}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">
                    Tidak ada item
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Subtotal</span>
            <span>{fmt(bill.subtotal)}</span>
          </div>
          {(bill.discount_amount ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Diskon</span>
              <span>-{fmt(bill.discount_amount!)}</span>
            </div>
          )}
          {bill.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Pajak</span>
              <span>{fmt(bill.tax_amount)}</span>
            </div>
          )}
          {(bill.materai_amount ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Materai</span>
              <span>{fmt(bill.materai_amount!)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-bold">
            <span>Total</span>
            <span>{fmt(bill.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Dibayar</span>
            <span>{fmt(bill.paid_amount)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Sisa</span>
            <span>{cancelled ? "—" : fmt(bill.remaining)}</span>
          </div>
        </div>
      </div>

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
            alert(getErrorMessage(e, "Gagal membatalkan pembelian"));
          }
        }}
      />
    </div>
  );
}

function PoDetailBody({
  supplierName,
  whName,
  orderDate,
  dueDate,
  shipLabel,
  textNotes,
  lines,
  subtotal,
  tax,
  total,
}: {
  supplierName?: string;
  whName?: string;
  orderDate?: string;
  dueDate?: string;
  shipLabel: string | null;
  textNotes: string;
  lines: PurchaseOrderLine[];
  subtotal: number;
  tax: number;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-slate-500">Supplier</p>
          <p className="font-medium">{supplierName ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Gudang</p>
          <p className="font-medium">{whName ?? "—"}</p>
        </div>
        <div>
          <p className="text-slate-500">Tanggal PO</p>
          <p className="font-medium">{fmtDate(orderDate)}</p>
        </div>
        <div>
          <p className="text-slate-500">Perkiraan terima</p>
          <p className="font-medium">{fmtDate(dueDate)}</p>
        </div>
      </div>

      {(shipLabel || textNotes) && (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
          {shipLabel && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Info pengiriman</p>
              <p className="mt-0.5 text-slate-700">{shipLabel}</p>
            </div>
          )}
          {textNotes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Catatan</p>
              <p className="mt-0.5 whitespace-pre-line text-slate-600">{textNotes}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Produk</th>
              <th className="px-3 py-2 text-center">Qty</th>
              <th className="px-3 py-2 text-right">Harga beli</th>
              <th className="px-3 py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-slate-50">
                <td className="px-3 py-2">{l.expand?.product?.name ?? "—"}</td>
                <td className="px-3 py-2 text-center">{fmtNum(l.qty)}</td>
                <td className="px-3 py-2 text-right">{fmt(l.unit_cost)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(l.line_total)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  Tidak ada item
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {tax > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">Pajak</span>
            <span>{fmt(tax)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-2 font-bold">
          <span>Total PO</span>
          <span>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );
}
