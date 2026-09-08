import { BIZ_DOC_KIND_META, type BizDocumentPrintData } from "@/lib/bisnis/doc-print-types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sellerBoxLabel(kind: BizDocumentPrintData["kind"]): string {
  return kind === "purchase_order" || kind === "bill" ? "Pembeli" : "Penjual";
}

/**
 * Stylesheet dokumen — self-contained (ikut di body) sehingga pratinjau layar
 * dan jendela cetak identik. Desain: dokumen bisnis A4 corporate,
 * warna utama biru tua, border tipis abu-abu, tanpa kotak dekoratif besar.
 */
const BIZ_DOC_STYLE = `
<style>
  .bizdoc { font-family: Inter, Arial, Helvetica, sans-serif; color: #0f172a; background: #fff;
    font-size: 12px; line-height: 1.38; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .bizdoc * { margin: 0; padding: 0; box-sizing: border-box; }
  .bizdoc .bd-page { background: #fff; }

  /* ===== Header ===== */
  .bizdoc .bd-header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2.5px solid #1e3a8a; padding-bottom: 8px; }
  .bizdoc .bd-title { font-size: 25px; font-weight: 800; letter-spacing: 1.5px; color: #1e3a8a; line-height: 1.1; }
  .bizdoc .bd-docno { margin-top: 3px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; font-weight: 600; color: #0f172a; }
  .bizdoc .bd-meta { margin-top: 6px; display: grid; grid-template-columns: auto auto; gap: 1px 26px; justify-content: start; }
  .bizdoc .bd-meta p { font-size: 11.5px; color: #475569; }
  .bizdoc .bd-meta b { color: #0f172a; font-weight: 600; }

  /* ===== Penjual / Pelanggan ===== */
  .bizdoc .bd-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .bizdoc .bd-party { border: 1px solid #e2e8f0; background: #f8fafc; padding: 7px 11px; border-radius: 4px; }
  .bizdoc .bd-party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1e3a8a; }
  .bizdoc .bd-party-name { margin-top: 3px; font-size: 13px; font-weight: 700; color: #0f172a; overflow-wrap: anywhere; }
  .bizdoc .bd-party p { font-size: 11.5px; color: #475569; margin-top: 1.5px; overflow-wrap: anywhere; }

  /* ===== Tabel produk ===== */
  .bizdoc .bd-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 10px; }
  .bizdoc .bd-table thead th { background: #1e3a8a; color: #ffffff; font-size: 10.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.7px; padding: 7px 9px; }
  .bizdoc .bd-table tbody td { padding: 5px 9px; font-size: 11.5px; border-bottom: 1px solid #e8edf3; vertical-align: top; }
  .bizdoc .bd-table .bd-c { text-align: center; }
  .bizdoc .bd-table .bd-r { text-align: right; }
  .bizdoc .bd-table .bd-l { text-align: left; }
  .bizdoc .bd-table .bd-prod { font-weight: 600; color: #0f172a; overflow-wrap: anywhere; }
  .bizdoc .bd-table .bd-sn { margin-top: 2px; font-size: 10px; font-weight: 400; color: #64748b;
    font-family: ui-monospace, Consolas, monospace; overflow-wrap: anywhere; }
  .bizdoc .bd-table .bd-sn b { font-weight: 600; color: #475569; font-family: Inter, Arial, sans-serif; }
  .bizdoc .bd-table .bd-num { color: #334155; font-variant-numeric: tabular-nums; }
  .bizdoc .bd-table .bd-sum { font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums; }
  .bizdoc .bd-table .bd-empty { text-align: center; color: #94a3b8; padding: 22px 0; }

  /* ===== Bawah: seksi kiri + ringkasan total kanan ===== */
  .bizdoc .bd-bottom { display: flex; gap: 16px; align-items: flex-start; margin-top: 10px; }
  .bizdoc .bd-bottom-left { flex: 1 1 58%; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .bizdoc .bd-bottom-right { flex: 0 0 38%; }

  .bizdoc .bd-section { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px 7px; }
  .bizdoc .bd-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px; }
  .bizdoc .bd-kv { display: flex; font-size: 11.5px; margin-top: 1.5px; }
  .bizdoc .bd-kv-k { flex: 0 0 110px; color: #64748b; }
  .bizdoc .bd-kv-v { flex: 1; color: #0f172a; font-weight: 500; overflow-wrap: anywhere; }
  .bizdoc .bd-note-text { font-size: 11.5px; color: #475569; white-space: pre-line; }

  .bizdoc .bd-totals { border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
  .bizdoc .bd-trow { display: flex; justify-content: space-between; gap: 12px; padding: 4px 11px; font-size: 11.5px; }
  .bizdoc .bd-trow .bd-tk { color: #64748b; }
  .bizdoc .bd-trow .bd-tv { color: #0f172a; font-weight: 500; font-variant-numeric: tabular-nums; }
  .bizdoc .bd-trow .bd-tv--danger { color: #b91c1c; }
  .bizdoc .bd-trow--paid .bd-tk { color: #047857; }
  .bizdoc .bd-trow--paid .bd-tv { color: #047857; font-weight: 600; }
  .bizdoc .bd-trow--total { background: #1e3a8a; padding: 8px 12px; margin-top: 4px; }
  .bizdoc .bd-trow--total .bd-tk, .bizdoc .bd-trow--total .bd-tv { color: #ffffff; font-size: 14px; font-weight: 800; }
  .bizdoc .bd-trow--remain { border-top: 1px dashed #cbd5e1; margin-top: 4px; padding-top: 7px; padding-bottom: 8px; }
  .bizdoc .bd-trow--remain .bd-tk { color: #0f172a; font-weight: 700; }
  .bizdoc .bd-trow--remain .bd-tv { font-weight: 800; font-size: 12.5px; }
  .bizdoc .bd-trow--remain .bd-tv--ok { color: #047857; }
  .bizdoc .bd-cancel-note { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
    font-size: 11px; text-align: center; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px; }

  /* ===== Tanda tangan ===== */
  .bizdoc .bd-signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 12px; }
  .bizdoc .bd-sign { text-align: center; }
  .bizdoc .bd-sign-label { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; }
  .bizdoc .bd-sign-space { height: 36px; }
  .bizdoc .bd-sign-line { border-top: 1px solid #94a3b8; margin: 0 14px; padding-top: 3px; font-size: 10.5px; color: #94a3b8; }

  /* ===== Footer legal ===== */
  .bizdoc .bd-legal { margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 5px;
    text-align: center; font-size: 10px; color: #94a3b8; }

  @media print {
    .bizdoc .bd-table thead { display: table-header-group; }
    .bizdoc .bd-bottom, .bizdoc .bd-signs, .bizdoc .bd-section, .bizdoc .bd-totals { break-inside: avoid; }
  }
</style>`;

function headerBlock(data: BizDocumentPrintData): string {
  const meta = BIZ_DOC_KIND_META[data.kind];
  const rows: string[] = [
    `<p>Tanggal: <b>${esc(data.docDate)}</b></p>`,
  ];
  if (data.paymentNote) {
    rows.push(`<p>${esc(data.paymentNote)}</p>`);
  } else if (data.dueDate) {
    rows.push(`<p>Jatuh tempo: <b>${esc(data.dueDate)}</b></p>`);
  }
  if (data.refNo) rows.push(`<p>Referensi: <b>${esc(data.refNo)}</b></p>`);
  if (data.linkedDoc) rows.push(`<p>${esc(data.linkedDoc)}</p>`);
  return `
  <div class="bd-header">
    <div>
      <div class="bd-title">${esc(meta.title)}</div>
      <div class="bd-docno">${esc(data.docNo)}</div>
      <div class="bd-meta">${rows.join("")}</div>
    </div>
  </div>`;
}

function partiesBlock(data: BizDocumentPrintData): string {
  const s = data.seller;
  const p = data.party;
  const extras = (p.lines ?? [])
    .map((x) => `<p>${esc(x.label)}: <span style="font-weight:600;color:#0f172a">${esc(x.value)}</span></p>`)
    .join("");
  return `
  <div class="bd-parties">
    <div class="bd-party">
      <p class="bd-party-label">${esc(sellerBoxLabel(data.kind))}</p>
      <p class="bd-party-name">${esc(s.name)}</p>
      ${s.phone ? `<p>Telp: ${esc(s.phone)}</p>` : ""}
      ${s.email ? `<p>Email: ${esc(s.email)}</p>` : ""}
      ${s.address ? `<p>${esc(s.address)}</p>` : ""}
    </div>
    <div class="bd-party">
      <p class="bd-party-label">${esc(p.title)}</p>
      <p class="bd-party-name">${esc(p.name)}</p>
      ${p.phone ? `<p>Telp: ${esc(p.phone)}</p>` : ""}
      ${p.email ? `<p>Email: ${esc(p.email)}</p>` : ""}
      ${p.address ? `<p>${esc(p.address)}</p>` : ""}
      ${extras}
    </div>
  </div>`;
}

function tableBlock(data: BizDocumentPrintData): string {
  const showDiscount = data.lines.some((l) => l.discount);
  const cols = showDiscount ? 5 : 4;
  const lineRows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="bd-l bd-prod">${esc(l.product)}${
          l.serials && l.serials.length > 0
            ? `<div class="bd-sn"><b>SN:</b> ${esc(l.serials.join(", "))}</div>`
            : ""
        }</td>
        <td class="bd-c bd-num">${esc(l.qty)}</td>
        <td class="bd-r bd-num">${esc(l.unitPrice)}</td>
        ${showDiscount ? `<td class="bd-r bd-num">${esc(l.discount ?? "")}</td>` : ""}
        <td class="bd-r bd-sum">${esc(l.lineTotal)}</td>
      </tr>`,
    )
    .join("");
  return `
  <table class="bd-table">
    <colgroup>
      <col style="width:40%" />
      <col style="width:10%" />
      <col style="width:18%" />
      ${showDiscount ? `<col style="width:12%" />` : ""}
      <col style="width:${showDiscount ? "20%" : "32%"}" />
    </colgroup>
    <thead>
      <tr>
        <th class="bd-l">Produk</th>
        <th class="bd-c">Qty</th>
        <th class="bd-r">Harga</th>
        ${showDiscount ? `<th class="bd-r">Diskon</th>` : ""}
        <th class="bd-r">Jumlah</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || `<tr><td colspan="${cols}" class="bd-empty">Tidak ada item</td></tr>`}
    </tbody>
  </table>`;
}

/** Ringkasan total — urutan baris mengikuti data.totals apa adanya (tidak diubah). */
function totalsBlock(data: BizDocumentPrintData): string {
  const rows = data.totals
    .map((r) => {
      if (r.emphasis) {
        return `
          <div class="bd-trow bd-trow--total">
            <span class="bd-tk">${esc(r.label)}</span>
            <span class="bd-tv">${esc(r.value)}</span>
          </div>`;
      }
      if (r.label === "Dibayar") {
        return `
          <div class="bd-trow bd-trow--paid">
            <span class="bd-tk">${esc(r.label)}</span>
            <span class="bd-tv">${esc(r.value)}</span>
          </div>`;
      }
      if (r.label === "Sisa tagihan") {
        return `
          <div class="bd-trow bd-trow--remain">
            <span class="bd-tk">Sisa Tagihan</span>
            <span class="bd-tv ${r.danger ? "bd-tv--danger" : "bd-tv--ok"}">${esc(r.value)}</span>
          </div>`;
      }
      return `
        <div class="bd-trow">
          <span class="bd-tk">${esc(r.label)}</span>
          <span class="bd-tv ${r.danger ? "bd-tv--danger" : ""}">${esc(r.value)}</span>
        </div>`;
    })
    .join("");
  const cancelled = data.footerNote
    ? `<div class="bd-cancel-note">${esc(data.footerNote)}</div>`
    : "";
  return `
  <div class="bd-bottom-right">
    ${cancelled}
    <div class="bd-totals" style="padding:6px 0 0">
      ${rows}
    </div>
  </div>`;
}

function kvRow(label: string, value?: string): string {
  if (!value) return "";
  return `
    <div class="bd-kv">
      <span class="bd-kv-k">${esc(label)}</span>
      <span class="bd-kv-v">${esc(value)}</span>
    </div>`;
}

function shippingSection(data: BizDocumentPrintData): string {
  const s = data.shippingInfo;
  if (!s) return "";
  const body = [
    kvRow("Expedisi", s.courier),
    kvRow("Layanan", s.service),
    kvRow("Nomor Lacak", s.trackingNo),
  ].join("");
  return `
  <div class="bd-section">
    <p class="bd-section-title">Informasi Pengiriman</p>
    ${body}
  </div>`;
}

function paymentSection(data: BizDocumentPrintData): string {
  const p = data.paymentInfo;
  if (!p && !data.bankNote) return "";
  const body = p
    ? [
        kvRow("Metode Pembayaran", p.method),
        kvRow("Bank", p.bank),
        kvRow("Nomor Rekening", p.accountNo),
        kvRow("Atas Nama", p.accountName),
      ].join("")
    : `<p class="bd-note-text">${esc(data.bankNote ?? "")}</p>`;
  return `
  <div class="bd-section">
    <p class="bd-section-title">Informasi Pembayaran</p>
    ${body}
  </div>`;
}

function notesSection(data: BizDocumentPrintData): string {
  if (!data.notes) return "";
  return `
  <div class="bd-section">
    <p class="bd-section-title">Catatan</p>
    <p class="bd-note-text">${esc(data.notes)}</p>
  </div>`;
}

function signaturesBlock(): string {
  const sign = (label: string) => `
    <div class="bd-sign">
      <p class="bd-sign-label">${label}</p>
      <div class="bd-sign-space"></div>
      <p class="bd-sign-line">Nama &amp; Tanda Tangan</p>
    </div>`;
  return `
  <div class="bd-signs">
    ${sign("Disiapkan Oleh")}
    ${sign("Diperiksa Oleh")}
    ${sign("Disetujui Oleh")}
  </div>`;
}

function legalFooterBlock(data: BizDocumentPrintData): string {
  if (!data.legalFooter) return "";
  return `<div class="bd-legal">${esc(data.legalFooter)}</div>`;
}

/** HTML pratinjau & cetak — layout dokumen bisnis A4 corporate. */
export function renderBizDocumentBodyHtml(data: BizDocumentPrintData): string {
  return `
${BIZ_DOC_STYLE}
<div class="bizdoc">
  <div class="bd-page">
    ${headerBlock(data)}
    ${partiesBlock(data)}
    ${tableBlock(data)}
    <div class="bd-bottom">
      <div class="bd-bottom-left">
        ${shippingSection(data)}
        ${paymentSection(data)}
        ${notesSection(data)}
      </div>
      ${totalsBlock(data)}
    </div>
    ${signaturesBlock()}
    ${legalFooterBlock(data)}
  </div>
</div>`;
}
