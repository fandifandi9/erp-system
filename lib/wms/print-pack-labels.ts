"use client";

import {
  getAwbQzPrinterName,
  getInvoiceQrQzPrinterName,
  getPackPrintMode,
} from "@/lib/wms/pack-print-preferences";
import {
  buildInvoiceAccessSlipHtml,
  printInvoiceAccessSlipBrowser,
  type InvoiceAccessSlipData,
} from "@/lib/wms/print-invoice-access-slip";
import { printHtmlViaQz, printPdfViaQz } from "@/lib/wms/qz-print";

export type PackDualPrintResult = {
  awbOk: boolean;
  invoiceOk: boolean;
  awbError?: string;
  invoiceError?: string;
};

async function fetchInvoiceSlip(soId: string, orderNo?: string): Promise<InvoiceAccessSlipData> {
  const res = await fetch(`/api/bisnis/sales-orders/${soId}/invoice-qr`, {
    credentials: "include",
  });
  const json = (await res.json()) as {
    ok?: boolean;
    reason?: string;
    invoice_no?: string;
    public_url?: string;
    qr_payload?: string;
    order_no?: string;
    store_name?: string | null;
    packing_list?: InvoiceAccessSlipData["packingList"];
    error?: string;
  };
  if (!res.ok || !json.ok || !json.invoice_no) {
    throw new Error(
      json.reason === "no_invoice"
        ? "Invoice belum ada — selesaikan picking ACC dulu."
        : json.error || "QR invoice tidak tersedia.",
    );
  }
  const publicUrl = (json.public_url || json.qr_payload || "").trim();
  if (!publicUrl) throw new Error("Link akses invoice kosong.");
  return {
    invoiceNo: json.invoice_no,
    publicUrl,
    storeName: json.store_name || undefined,
    packingList: json.packing_list ?? [],
  };
}

async function ensureAwbPdfUrl(soId: string): Promise<string> {
  // Cetak: pakai file yang sudah ada; generate hanya jika belum ada (tanpa force).
  const { fetchAwbLabelInfo, ensureAwbLabelReady } = await import("@/lib/bisnis/awb-label-client");
  let info = await fetchAwbLabelInfo(soId);
  if (!info.has_file || !info.url) {
    info = await ensureAwbLabelReady(soId);
  }
  if (!info.has_file || !info.url) {
    throw new Error("Label AWB belum siap.");
  }
  return info.url;
}

function printPdfBrowser(url: string): void {
  const w = window.open(url, "_blank");
  w?.addEventListener("load", () => w.print());
}

/**
 * Cetak AWB saja — QZ jika mode packing QZ, else dialog browser.
 * Asumsikan file AWB sudah ada (pre-generate saat picking ACC).
 */
export async function printAwbLabelSmart(salesOrderId: string): Promise<void> {
  const url = await ensureAwbPdfUrl(salesOrderId);
  const mode = getPackPrintMode();
  if (mode === "qz") {
    const printer = getAwbQzPrinterName();
    if (!printer) throw new Error("Printer AWB (QZ) belum dipilih di pengaturan packing.");
    await printPdfViaQz(printer, url);
    return;
  }
  printPdfBrowser(url);
}

/**
 * Satu aksi: cetak AWB ke printer termal label + QR invoice ke printer slip terpisah.
 * Mode QZ: masing-masing printer dari preferensi packing.
 * Mode browser: buka dialog/print berurutan (fallback).
 */
export async function printAwbAndInvoiceAccess(opts: {
  salesOrderId: string;
  orderNo?: string;
}): Promise<PackDualPrintResult> {
  const mode = getPackPrintMode();
  const result: PackDualPrintResult = { awbOk: false, invoiceOk: false };

  let awbUrl = "";
  let slip: InvoiceAccessSlipData | null = null;

  try {
    awbUrl = await ensureAwbPdfUrl(opts.salesOrderId);
  } catch (e) {
    result.awbError = e instanceof Error ? e.message : String(e);
  }

  try {
    slip = await fetchInvoiceSlip(opts.salesOrderId, opts.orderNo);
  } catch (e) {
    result.invoiceError = e instanceof Error ? e.message : String(e);
  }

  if (mode === "qz") {
    const awbPrinter = getAwbQzPrinterName();
    const invPrinter = getInvoiceQrQzPrinterName();

    if (awbUrl) {
      try {
        if (!awbPrinter) throw new Error("Printer AWB (QZ) belum dipilih di pengaturan packing.");
        await printPdfViaQz(awbPrinter, awbUrl);
        result.awbOk = true;
      } catch (e) {
        result.awbError = e instanceof Error ? e.message : String(e);
      }
    }

    if (slip) {
      try {
        if (!invPrinter) throw new Error("Printer QR invoice (QZ) belum dipilih di pengaturan packing.");
        const html = await buildInvoiceAccessSlipHtml(slip);
        await printHtmlViaQz(invPrinter, html);
        result.invoiceOk = true;
      } catch (e) {
        result.invoiceError = e instanceof Error ? e.message : String(e);
      }
    }

    return result;
  }

  // Browser fallback — berurutan, jeda singkat agar dialog tidak bentrok.
  if (awbUrl) {
    try {
      printPdfBrowser(awbUrl);
      result.awbOk = true;
    } catch (e) {
      result.awbError = e instanceof Error ? e.message : String(e);
    }
  }
  if (slip) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      await printInvoiceAccessSlipBrowser(slip);
      result.invoiceOk = true;
    } catch (e) {
      result.invoiceError = e instanceof Error ? e.message : String(e);
    }
  }

  return result;
}
