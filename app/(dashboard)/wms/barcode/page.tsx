"use client";

import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { BarcodeLabelStudio } from "@/components/wms/BarcodeLabelStudio";
import { useLocale } from "@/components/LocaleProvider";

export default function WmsBarcodePage() {
  const { t } = useLocale();
  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.barcode.title")}
        subtitle={t("inventory.barcode.subtitle")}
        module="wms"
      >
        <BarcodeLabelStudio />
      </InventoryShell>
    </InventoryGate>
  );
}
