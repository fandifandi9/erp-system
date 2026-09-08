import { bizDocFmtDate } from "@/lib/bisnis/doc-print-format";

export type ShareEmailDocKind =
  | "invoice"
  | "sales_order"
  | "quotation"
  | "purchase_order";

export type ShareEmailDoc = {
  kind: ShareEmailDocKind;
  docNo: string;
  customerName: string;
  issueOrOrderDate: string;
  dueDate?: string;
  total: number;
  remaining?: number;
  paid?: boolean;
  publicUrl: string;
  store?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
};

const DOC_TITLE: Record<ShareEmailDocKind, string> = {
  invoice: "Invoice penjualan",
  sales_order: "Sales Order",
  quotation: "Penawaran penjualan",
  purchase_order: "Purchase Order",
};

const DOC_INTRO: Record<ShareEmailDocKind, string> = {
  invoice: "tagihan",
  sales_order: "pesanan",
  quotation: "penawaran",
  purchase_order: "pesanan pembelian",
};

function fmtIdr(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildShareDocEmailHtml(doc: ShareEmailDoc): string {
  const title = DOC_TITLE[doc.kind];
  const storeName = doc.store?.name ?? "SERBA";
  const remainingRow =
    doc.kind === "invoice"
      ? `<tr>
          <td style="padding:8px 0;color:#64748b;">Sisa tagihan</td>
          <td style="padding:8px 0;text-align:right;font-weight:700;color:${doc.paid ? "#059669" : "#c2410c"};">
            ${doc.paid ? "Lunas" : fmtIdr(doc.remaining ?? 0)}
          </td>
        </tr>`
      : "";

  const partyLabel =
    doc.kind === "purchase_order" ? "Kepada supplier" : "Kepada pelanggan";

  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#eef2ff,#e0e7ff);padding:24px 28px;">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4f46e5;">${title}</p>
        <h1 style="margin:8px 0 0;font-size:22px;color:#0f172a;">${storeName}</h1>
        ${doc.store?.phone ? `<p style="margin:6px 0 0;font-size:14px;color:#475569;">${doc.store.phone}</p>` : ""}
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;">${partyLabel}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#334155;">Yth. <strong>${doc.customerName}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5;">
          Terima kasih atas kerja samanya. Berikut ringkasan ${DOC_INTRO[doc.kind]} Anda:
        </p>
        <table width="100%" style="font-size:14px;color:#334155;border-top:1px solid #f1f5f9;">
          <tr>
            <td style="padding:8px 0;color:#64748b;">No. dokumen</td>
            <td style="padding:8px 0;text-align:right;font-weight:600;font-family:monospace;">${doc.docNo}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;">Tanggal</td>
            <td style="padding:8px 0;text-align:right;">${bizDocFmtDate(doc.issueOrOrderDate)}</td>
          </tr>
          ${
            doc.dueDate
              ? `<tr>
            <td style="padding:8px 0;color:#64748b;">${doc.kind === "purchase_order" ? "Perkiraan terima" : "Jatuh tempo"}</td>
            <td style="padding:8px 0;text-align:right;">${bizDocFmtDate(doc.dueDate)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:8px 0;color:#64748b;">Total</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;">${fmtIdr(doc.total)}</td>
          </tr>
          ${remainingRow}
        </table>
        <p style="margin:28px 0 20px;text-align:center;">
          <a href="${doc.publicUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;">
            Lihat detail &amp; cetak
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all;">${doc.publicUrl}</p>
      </div>
    </td></tr>
    <tr><td style="padding:16px 8px;text-align:center;font-size:11px;color:#94a3b8;">
      Email dikirim otomatis dari SERBA ERP · ${storeName}
    </td></tr>
  </table>
</body>
</html>`;
}

const DOC_LABEL: Record<ShareEmailDocKind, string> = {
  invoice: "Invoice",
  sales_order: "Sales Order",
  quotation: "Penawaran",
  purchase_order: "Purchase Order",
};

export function buildShareDocEmailText(doc: ShareEmailDoc): string {
  const lines = [
    `Yth. ${doc.customerName},`,
    "",
    `${DOC_LABEL[doc.kind]} ${doc.docNo}`,
    `Total: ${fmtIdr(doc.total)}`,
  ];
  if (doc.kind === "invoice" && doc.remaining != null && !doc.paid) {
    lines.push(`Sisa: ${fmtIdr(doc.remaining)}`, `Jatuh tempo: ${bizDocFmtDate(doc.dueDate)}`);
  }
  if (doc.dueDate && doc.kind !== "invoice") {
    lines.push(`Tanggal terkait: ${bizDocFmtDate(doc.dueDate)}`);
  }
  lines.push("", `Lihat: ${doc.publicUrl}`, "", doc.store?.name ?? "SERBA");
  if (doc.store?.phone) lines.push(doc.store.phone);
  return lines.join("\n");
}
