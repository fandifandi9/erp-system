/**
 * CSS jendela cetak — hanya pengaturan halaman; gaya dokumen sudah
 * self-contained di renderBizDocumentBodyHtml (lib/bisnis/doc-print-html.ts).
 */
export const BIZ_DOC_PRINT_CSS = `
@page { size: A4 portrait; margin: 15mm; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { margin: 0; padding: 0; background: #fff; }
@media print {
  body { margin: 0; }
}
`;
