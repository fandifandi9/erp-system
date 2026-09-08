import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import type { SalesOrder } from "@/lib/bisnis/types";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { buildPkQrPayload, pkCodeBody } from "@/lib/wms/pk-number";

export type PkLabelPrintData = {
  pkNo: string;
  orderNo: string;
  storeName: string;
  storePhone: string;
  customerName: string;
  customerPhone: string;
};

function dash(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  return t || "—";
}

/**
 * Label thermal 80×100 mm — sama ukuran label AWB, konten AMBIL SENDIRI + PK.
 * jsPDF memakai baseline: caption & nilai besar tidak boleh satu baris sempit.
 */
export async function renderPkPickupLabelPdf(data: PkLabelPrintData): Promise<Uint8Array> {
  const w = 80;
  const h = 100;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: [w, h] });
  const L = 4;
  const R = w - 4;
  const usable = R - L;
  let y = 3;

  const rule = () => {
    y += 1.2;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(L, y, R, y);
    y += 3;
  };

  // Header: baris tetap — nama toko & badge sejajar vertikal (baseline sama).
  const headerBaseline = y + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(dash(data.storeName), L, headerBaseline);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(70);
  doc.text("AMBIL SENDIRI", R, headerBaseline, { align: "right" });
  y = headerBaseline + 2.5;
  rule();

  // Banner judul
  const bannerH = 8;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(L, y, usable, bannerH, 1, 1, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LABEL PK — AMBIL SENDIRI", L + usable / 2, y + bannerH / 2 + 1.1, {
    align: "center",
  });
  doc.setTextColor(0);
  y += bannerH + 3;
  rule();

  // Nomor PK besar + QR — tanpa caption "PK/NOMOR PK" (sudah di banner; hindari tabrakan).
  const qrSize = 20;
  const pkBlockTop = y;
  const pkMaxW = usable - qrSize - 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0);
  const pkDisplay = dash(data.pkNo);
  // Baseline cukup jauh dari garis atas agar glyph 18pt tidak menabrak rule.
  const pkBaseline = pkBlockTop + 7;
  const pkLines = doc.splitTextToSize(pkDisplay, pkMaxW) as string[];
  let pkBottom = pkBaseline;
  doc.text(pkLines[0] ?? "—", L, pkBaseline);
  for (let i = 1; i < pkLines.length; i++) {
    pkBottom += 6.5;
    doc.text(pkLines[i], L, pkBottom);
  }

  try {
    const qrPayload = buildPkQrPayload(data.pkNo) || data.pkNo;
    const qr = await QRCode.toDataURL(qrPayload, {
      width: 160,
      margin: 0,
      errorCorrectionLevel: "M",
    });
    doc.addImage(qr, "PNG", R - qrSize, pkBlockTop, qrSize, qrSize);
    y = Math.max(pkBottom + 2, pkBlockTop + qrSize) + 1.5;
  } catch {
    y = pkBottom + 3;
  }
  rule();

  // ORDER — caption lalu nilai (jarak aman dari baseline).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(100);
  doc.text("ORDER", L, y);
  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(dash(data.orderNo), L, y);
  y += 4;
  rule();

  // PELANGGAN
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(100);
  doc.text("PELANGGAN", L, y);
  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  const nameLines = doc.splitTextToSize(dash(data.customerName), usable) as string[];
  doc.text(nameLines[0] ?? "—", L, y);
  for (let i = 1; i < nameLines.length; i++) {
    y += 5;
    doc.text(nameLines[i], L, y);
  }
  y += 4;

  if (data.customerPhone.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(100);
    doc.text("TELP", L, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(dash(data.customerPhone), L, y);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export function buildPkLabelDataFromSo(so: SalesOrder): PkLabelPrintData {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const pk = getPkFromSo(so);
  const { textNotes } = parseNotesWithShipping(so.notes ?? "");
  const phoneMatch =
    textNotes.match(/(?:telp|telepon|phone|hp|wa)\s*[:：]\s*([+\d][\d\s\-()]{6,})/i);
  return {
    pkNo: pk ? pkCodeBody(pk) : "—",
    orderNo: so.order_no,
    storeName: wf.order_meta?.store_name?.trim() || so.expand?.store?.name?.trim() || "",
    storePhone: so.expand?.store?.phone?.trim() || "",
    customerName:
      wf.order_meta?.customer_name?.trim() || so.expand?.customer?.name?.trim() || "",
    customerPhone: phoneMatch?.[1]?.trim() || so.expand?.customer?.phone?.trim() || "",
  };
}
