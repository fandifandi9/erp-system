import { BIZ_DOC_PRINT_CSS } from "@/lib/bisnis/doc-print-css";
import { renderBizDocumentBodyHtml } from "@/lib/bisnis/doc-print-html";
import type { BizDocumentPrintData } from "@/lib/bisnis/doc-print-types";

export function openBizDocumentPrint(data: BizDocumentPrintData): void {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Izinkan pop-up untuk mencetak dokumen.");
    return;
  }
  const body = renderBizDocumentBodyHtml(data);
  win.document.write(
    `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>${data.docNo}</title><style>${BIZ_DOC_PRINT_CSS}</style></head><body>${body}</body></html>`,
  );
  win.document.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 350);
}
