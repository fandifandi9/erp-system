"use client";

import { printPkReceipts, type PkReceiptData } from "@/lib/wms/print-pk-receipt";
import {
  getPkNetworkConfig,
  getPkPrinterName,
  getPkPrintMode,
} from "@/lib/wms/printer-preferences";
import { printHtmlViaQz } from "@/lib/wms/qz-print";
import { buildPkReceiptsHtml } from "@/lib/wms/print-pk-receipt";

/** Kirim slip PK ke printer jaringan (server → IP:9100 ESC/POS raster = identik dialog). */
async function printViaNetwork(list: PkReceiptData[]): Promise<void> {
  const { host, port, widthMm } = getPkNetworkConfig();
  if (!host) throw new Error("IP printer belum diatur.");

  // Render slip jadi bitmap (mirip layout HTML) agar hasil identik & tidak kepotong.
  const { renderPkSlipRasters } = await import("@/lib/wms/pk-raster");
  const rasters = await renderPkSlipRasters(list, widthMm);

  const res = await fetch("/api/wms/print-pk", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host, port, widthMm, rasters }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal cetak ke printer jaringan.");
}

/**
 * Cetak slip PK sesuai mode:
 * - network: langsung ke printer WiFi/LAN (ESC/POS) — tanpa dialog, universal.
 * - qz: printer lokal via QZ Tray — tanpa dialog.
 * - browser: dialog cetak (fallback).
 */
export async function printPkReceiptsSmart(list: PkReceiptData[]): Promise<void> {
  if (typeof window === "undefined" || list.length === 0) return;

  const mode = getPkPrintMode();

  if (mode === "network") {
    try {
      await printViaNetwork(list);
      return;
    } catch (e) {
      console.warn("Cetak jaringan gagal, fallback ke cetak browser:", e);
    }
  }

  if (mode === "qz" && getPkPrinterName()) {
    try {
      const html = await buildPkReceiptsHtml(list);
      await printHtmlViaQz(getPkPrinterName(), html);
      return;
    } catch (e) {
      console.warn("QZ print gagal, fallback ke cetak browser:", e);
    }
  }

  await printPkReceipts(list);
}
