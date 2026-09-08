import { buildJob, printBarcodeLabels, productToLabelItem } from "@/lib/inventory/barcode-label-engine";

export type ProductBarcodePrintMeta = {
  sku: string;
  barcode: string;
  productName: string;
  poNo?: string;
  copies: number;
};

/** Cetak label barcode produk (Code128, printer termal 50×30). */
export function printProductBarcodeLabels(meta: ProductBarcodePrintMeta): void {
  if (typeof window === "undefined") return;
  const item = productToLabelItem({
    sku: meta.sku,
    barcode: meta.barcode,
    name: meta.productName,
  });
  if (meta.poNo) {
    item.title = [item.title, meta.poNo].filter(Boolean).join(" · ");
  }
  void printBarcodeLabels(
    buildJob([item], {
      copiesPerItem: meta.copies,
      paper: "thermal",
      label: { widthMm: 50, heightMm: 30 },
      symbology: "code128",
      showTitle: true,
      showCode: true,
    }),
  ).catch((e) => alert(e instanceof Error ? e.message : "Gagal cetak label"));
}
