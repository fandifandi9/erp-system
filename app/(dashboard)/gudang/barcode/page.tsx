"use client";

import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { BarcodeLabelStudio } from "@/components/wms/BarcodeLabelStudio";

export default function GudangBarcodePage() {
  return (
    <InventoryGate>
      <InventoryShell
        title="Barcode & Label"
        subtitle="Code128 + QR untuk printer label termal — dari master produk atau kode manual."
        module="wms"
      >
        <BarcodeLabelStudio />
      </InventoryShell>
    </InventoryGate>
  );
}
