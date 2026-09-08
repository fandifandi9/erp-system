"use client";

import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import {
  buildPkLabelDataFromSo,
  renderPkPickupLabelPdf,
} from "@/lib/wms/pk-label-generate";
import {
  getAwbQzPrinterName,
  getPackPrintMode,
} from "@/lib/wms/pack-print-preferences";
import { printPdfViaQz } from "@/lib/wms/qz-print";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";

/** Cetak label PK 80×100 mm ke printer yang sama dengan AWB. */
export async function printPkPickupLabelSmart(salesOrderId: string): Promise<void> {
  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(salesOrderId, {
    expand: "customer,store",
  });
  const data = buildPkLabelDataFromSo(so);
  if (!data.pkNo || data.pkNo === "—") {
    throw new Error("Nomor PK belum tersedia — pastikan order sudah masuk picking.");
  }
  const bytes = await renderPkPickupLabelPdf(data);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  try {
    const mode = getPackPrintMode();
    if (mode === "qz") {
      const printer = getAwbQzPrinterName();
      if (!printer) {
        throw new Error("Printer label (QZ) belum dipilih — sama printer AWB di pengaturan packing.");
      }
      await printPdfViaQz(printer, url);
    } else {
      const w = window.open(url, "_blank");
      w?.addEventListener("load", () => w.print());
    }

    const wf = parseOutboundWorkflow(so.outbound_workflow_json);
    const now = new Date().toISOString();
    if (!wf.pk_printed_at) {
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(salesOrderId, {
        outbound_workflow_json: serializeOutboundWorkflow({ ...wf, pk_printed_at: now }),
      });
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
