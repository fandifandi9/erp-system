"use client";

import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { BarcodeLabelStudio } from "@/components/wms/BarcodeLabelStudio";

export default function WmsBarcodePage() {
  return (
    <InventoryGate>
      <InventoryShell
        title="Barcode & Label"
        subtitle="Code128, UPC-A, ITF, QR — cetak label termal atau unduh dari master produk / kode manual."
        module="wms"
      >
        <BarcodeLabelStudio />
      </InventoryShell>
    </InventoryGate>
  );
}
