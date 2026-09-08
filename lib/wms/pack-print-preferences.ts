"use client";

/** Preferensi printer packing: AWB (termal label) vs QR invoice / tanda terima (slip 80mm). */

const AWB_QZ_KEY = "wms_awb_qz_printer";
const INV_QR_QZ_KEY = "wms_invoice_qr_qz_printer";
const HANDOVER_QZ_KEY = "wms_handover_qz_printer";
const PACK_MODE_KEY = "wms_pack_print_mode";

export type PackPrintMode = "qz" | "browser";

function read(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function write(key: string, val: string): void {
  if (typeof window === "undefined") return;
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export function getPackPrintMode(): PackPrintMode {
  return read(PACK_MODE_KEY) === "qz" ? "qz" : "browser";
}

export function setPackPrintMode(mode: PackPrintMode): void {
  write(PACK_MODE_KEY, mode);
}

export function getAwbQzPrinterName(): string {
  return read(AWB_QZ_KEY);
}

export function setAwbQzPrinterName(name: string): void {
  write(AWB_QZ_KEY, name.trim());
}

export function getInvoiceQrQzPrinterName(): string {
  return read(INV_QR_QZ_KEY);
}

export function setInvoiceQrQzPrinterName(name: string): void {
  write(INV_QR_QZ_KEY, name.trim());
}

/** Printer tanda terima termal 80mm — default sama printer QR invoice. */
export function getHandoverQzPrinterName(): string {
  return read(HANDOVER_QZ_KEY) || getInvoiceQrQzPrinterName();
}

export function setHandoverQzPrinterName(name: string): void {
  write(HANDOVER_QZ_KEY, name.trim());
}
