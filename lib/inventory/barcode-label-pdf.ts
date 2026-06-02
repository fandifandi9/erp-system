/** Ekspor PDF — dipisah agar jspdf hanya dimuat saat unduh PDF (client). */

import type { BarcodeLabelJob } from "./barcode-label-engine";
import { renderLabelCanvas, SHEET_PAPERS, sheetGrid } from "./barcode-label-engine";

export async function exportBarcodeLabelsPdf(
  job: BarcodeLabelJob,
  flat: import("./barcode-label-engine").BarcodeLabelItem[],
  safeCode: string,
  stamp: string,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const thermal = job.paper === "thermal";
  const paperDef = SHEET_PAPERS.find((p) => p.id === job.paper);

  if (thermal || !paperDef) {
    const doc = new jsPDF({
      orientation: job.label.widthMm > job.label.heightMm ? "l" : "p",
      unit: "mm",
      format: [job.label.widthMm, job.label.heightMm],
    });
    for (let i = 0; i < flat.length; i++) {
      if (i > 0) doc.addPage([job.label.widthMm, job.label.heightMm]);
      const c = await renderLabelCanvas(flat[i]!, job);
      doc.addImage(c.toDataURL("image/png"), "PNG", 0, 0, job.label.widthMm, job.label.heightMm);
    }
    doc.save(`label-${safeCode}-${stamp}.pdf`);
    return;
  }

  const doc = new jsPDF({
    orientation: paperDef.widthMm > paperDef.heightMm ? "l" : "p",
    unit: "mm",
    format: [paperDef.widthMm, paperDef.heightMm],
  });
  const { cols, perPage } = sheetGrid(paperDef, job.label);
  const margin = 8;
  let idx = 0;
  let page = 0;
  while (idx < flat.length) {
    if (page > 0) doc.addPage([paperDef.widthMm, paperDef.heightMm]);
    for (let slot = 0; slot < perPage && idx < flat.length; slot++, idx++) {
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const x = margin + col * job.label.widthMm;
      const y = margin + row * job.label.heightMm;
      const c = await renderLabelCanvas(flat[idx]!, job);
      doc.addImage(c.toDataURL("image/png"), "PNG", x, y, job.label.widthMm, job.label.heightMm);
    }
    page++;
  }
  doc.save(`label-sheet-${job.paper}-${stamp}.pdf`);
}
