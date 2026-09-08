import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "./types";
import {
  buildNotesWithShipping,
  parseNotesWithShipping,
} from "./shipping-notes";
import { getAwbTrackingFromOrder, hasAwbLabelFile } from "./awb-label";
import { resolveMarketplaceLabel } from "@/lib/wms/validate-order-context";
import { extractAwbFromOrder, applyPackageIdentityToWorkflow } from "@/lib/wms/package-identity";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { formatPkDisplay } from "@/lib/wms/pk-number";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
  type PackageIdentityState,
} from "@/lib/wms/outbound-workflow";
import { syncPickupGateForOrder } from "@/lib/wms/sync-pickup-gate";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";

export type AwbLabelPrintData = {
  trackingNo: string;
  courier: string;
  service: string;
  orderNo: string;
  /** Nama toko = pengirim */
  senderName: string;
  senderPhone: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  marketplace: string;
};

/**
 * Nomor resi AWB sungguhan saja — tidak memakai PK / invent nomor.
 * Tanpa AWB → tidak boleh buat label pengiriman.
 */
export function resolveRealAwbTrackingNo(so: SalesOrder): string | null {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const candidates = [
    extractAwbFromOrder(so, wf)?.trim() ?? "",
    getAwbTrackingFromOrder(so),
  ];

  const pkRaw = getPkFromSo(so);
  const pkDisp = pkRaw ? formatPkDisplay(pkRaw) : "";

  for (const raw of candidates) {
    const c = raw.trim();
    if (!c) continue;
    // Jangan anggap PK sebagai resi AWB (bug lama: invent tracking dari PK).
    if (pkDisp && formatPkDisplay(c) === pkDisp) continue;
    if (pkRaw && c === pkRaw.trim()) continue;
    return c;
  }
  return null;
}

/** @deprecated Gunakan resolveRealAwbTrackingNo — jangan invent resi dari PK. */
export function resolveOrGenerateTrackingNo(so: SalesOrder): string {
  const real = resolveRealAwbTrackingNo(so);
  if (real) return real;
  throw new Error(
    "Nomor AWB/resi belum diisi. Label pengiriman hanya boleh dibuat setelah AWB tersedia. Untuk ambil sendiri, cetak Label PK.",
  );
}

function dash(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  return t || "—";
}

/**
 * Label thermal padat 80×100 mm — satu ukuran kertas.
 * Label & nilai satu baris agar tidak bertumpuk (jsPDF baseline).
 */
export async function renderAwbLabelPdf(data: AwbLabelPrintData): Promise<Uint8Array> {
  const w = 80;
  const h = 100;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: [w, h] });
  const L = 4;
  const R = w - 4;
  const mid = w / 2 + 0.5;
  const usable = R - L;
  let y = 5;

  /** 1pt ≈ 0.35mm — tinggi baris aman untuk ukuran font. */
  const lh = (pt: number) => pt * 0.42;

  const rule = () => {
    y += 1;
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(L, y, R, y);
    y += 3.2;
  };

  /** Satu baris: "LABEL  nilai" — tidak stack vertikal. */
  const row = (label: string, value: string, size = 9, maxW = usable) => {
    const prefix = `${label}  `;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(90);
    doc.text(prefix, L, y);
    const prefixW = doc.getTextWidth(prefix);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(0);
    const lines = doc.splitTextToSize(dash(value), Math.max(8, maxW - prefixW)) as string[];
    doc.text(lines[0] ?? "—", L + prefixW, y);
    for (let i = 1; i < lines.length; i++) {
      y += lh(size);
      doc.text(lines[i], L, y);
    }
    y += lh(size) + 1.2;
  };

  /** Dua kolom sejajar, masing-masing "LABEL  nilai". */
  const twoCol = (
    lLabel: string,
    lVal: string,
    rLabel: string,
    rVal: string,
    size = 9,
  ) => {
    const colW = mid - L - 1;
    const y0 = y;

    const drawCol = (label: string, value: string, xPos: number, width: number) => {
      const prefix = `${label}  `;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(90);
      doc.text(prefix, xPos, y0);
      const prefixW = doc.getTextWidth(prefix);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size);
      doc.setTextColor(0);
      const lines = doc.splitTextToSize(dash(value), Math.max(8, width - prefixW)) as string[];
      let yy = y0;
      doc.text(lines[0] ?? "—", xPos + prefixW, yy);
      for (let i = 1; i < lines.length; i++) {
        yy += lh(size);
        doc.text(lines[i], xPos, yy);
      }
      return yy + lh(size);
    };

    const yL = drawCol(lLabel, lVal, L, colW);
    const yR = drawCol(rLabel, rVal, mid, R - mid);
    y = Math.max(yL, yR) + 1.2;
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(dash(data.senderName), L, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(80);
  doc.text("LABEL PENGIRIMAN", R, y, { align: "right" });
  y += 4;
  rule();

  twoCol("EKSPEDISI", data.courier, "LAYANAN", data.service, 10);
  rule();

  // Resi + QR
  const qrSize = 18;
  const resiStart = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(90);
  const resiPrefix = "RESI  ";
  doc.text(resiPrefix, L, y);
  const resiPrefixW = doc.getTextWidth(resiPrefix);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0);
  const resiLines = doc.splitTextToSize(dash(data.trackingNo), usable - qrSize - 4 - resiPrefixW) as string[];
  doc.text(resiLines[0] ?? "—", L + resiPrefixW, y);
  let resiY = y;
  for (let i = 1; i < resiLines.length; i++) {
    resiY += lh(12);
    doc.text(resiLines[i], L, resiY);
  }
  resiY += lh(12);

  try {
    const qr = await QRCode.toDataURL(data.trackingNo, {
      width: 140,
      margin: 0,
      errorCorrectionLevel: "M",
    });
    doc.addImage(qr, "PNG", R - qrSize, resiStart - 2, qrSize, qrSize);
    y = Math.max(resiY, resiStart - 2 + qrSize) + 1.5;
  } catch {
    y = resiY + 1;
  }
  rule();

  twoCol("PENGIRIM", data.senderName, "TELP", data.senderPhone, 8);
  rule();
  twoCol("PENERIMA", data.recipientName, "TELP", data.recipientPhone, 9);
  rule();

  row("ALAMAT", data.recipientAddress, 8, usable);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(80);
  const foot = [
    data.orderNo.trim() || "",
    data.marketplace.trim() && data.marketplace !== "—" ? data.marketplace.trim() : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (foot) {
    y += 0.5;
    doc.text(foot, L, Math.min(y, h - 3));
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

function phoneFromNotes(notes: string): string {
  const m =
    notes.match(/(?:telp|telepon|phone|hp|wa|whatsapp)\s*penerima\s*[:：]\s*([+\d][\d\s\-()]{6,})/i) ||
    notes.match(/(?:telp|telepon|phone|hp|wa)\s*[:：]\s*([+\d][\d\s\-()]{6,})/i);
  return m?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function buildLabelData(so: SalesOrder, trackingNo: string): AwbLabelPrintData {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const { textNotes, shipping } = parseNotesWithShipping(so.notes ?? "");
  const courier = wf.order_meta?.courier?.trim() || shipping.courier?.trim() || "";
  const service =
    wf.order_meta?.shipping_service?.trim() || shipping.shipping_service?.trim() || "";
  const recipientName =
    wf.order_meta?.customer_name?.trim() || so.expand?.customer?.name?.trim() || "";
  const recipientAddress =
    wf.order_meta?.recipient_address?.trim() ||
    shipping.recipient_address?.trim() ||
    so.expand?.customer?.address?.trim() ||
    "";
  const senderName = wf.order_meta?.store_name?.trim() || so.expand?.store?.name?.trim() || "";
  const senderPhone = so.expand?.store?.phone?.trim() || "";
  const recipientPhone =
    phoneFromNotes(textNotes) ||
    phoneFromNotes(so.notes ?? "") ||
    so.expand?.customer?.phone?.trim() ||
    "";

  return {
    trackingNo,
    courier,
    service,
    orderNo: so.order_no,
    senderName,
    senderPhone,
    recipientName,
    recipientPhone,
    recipientAddress,
    marketplace: resolveMarketplaceLabel(so),
  };
}

function notesWithTracking(so: SalesOrder, trackingNo: string): string | undefined {
  const { textNotes, shipping } = parseNotesWithShipping(so.notes ?? "");
  if (shipping.tracking_no.trim() === trackingNo) {
    return so.notes?.trim() || undefined;
  }
  const next = { ...shipping, tracking_no: trackingNo, enabled: true };
  return buildNotesWithShipping(textNotes, next);
}

function workflowWithAwb(so: SalesOrder, trackingNo: string): string | undefined {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const identity: PackageIdentityState = {
    type: "awb",
    code: trackingNo,
    awb: trackingNo,
    assigned_at: new Date().toISOString(),
  };
  const next = applyPackageIdentityToWorkflow(wf, identity);
  const json = serializeOutboundWorkflow(next);
  return json !== so.outbound_workflow_json ? json : undefined;
}

export type EnsureAwbLabelOpts = {
  /** Timpa file lama (layout baru / data lengkap). */
  force?: boolean;
};

/** Buat PDF AWB + simpan ke SO. Hanya mode dikirim + nomor AWB sungguhan. */
export async function ensureAwbLabelForSalesOrder(
  adminPb: PocketBase,
  soId: string,
  opts?: EnsureAwbLabelOpts,
): Promise<SalesOrder> {
  const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
    expand: "customer,store",
  });

  if (isWmsPickupFulfillment(so)) {
    throw new Error(
      "Order ambil sendiri — jangan buat label pengiriman. Cetak Label PK di packing.",
    );
  }

  if (!opts?.force && hasAwbLabelFile(so)) return so;

  const trackingNo = resolveRealAwbTrackingNo(so);
  if (!trackingNo) {
    throw new Error(
      "Nomor AWB/resi belum diisi. Lengkapi di penjualan dulu — label pengiriman tidak boleh dibuat tanpa AWB.",
    );
  }

  const labelData = buildLabelData(so, trackingNo);
  const pdfBytes = await renderAwbLabelPdf(labelData);
  const filename = `awb-${trackingNo.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const file = new File([Buffer.from(pdfBytes)], filename, { type: "application/pdf" });

  const fd = new FormData();
  fd.set("awb_label", file);
  fd.set("awb_ready_at", new Date().toISOString());
  fd.set("awb_source", "system");

  const notes = notesWithTracking(so, trackingNo);
  if (notes !== undefined && notes !== so.notes) {
    fd.set("notes", notes);
  }

  const wfJson = workflowWithAwb(so, trackingNo);
  if (wfJson) {
    fd.set("outbound_workflow_json", wfJson);
  }

  await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, fd);
  const synced = await syncPickupGateForOrder(soId, adminPb);
  return (
    synced ??
    (await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
      expand: "customer,store",
    }))
  );
}
