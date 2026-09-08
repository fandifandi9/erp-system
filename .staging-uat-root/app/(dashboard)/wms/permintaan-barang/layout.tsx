"use client";

import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { PermintaanBarangTabs } from "@/components/wms/PermintaanBarangTabs";
import { useLocale } from "@/components/LocaleProvider";

export default function PermintaanBarangLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <InventoryGate>
      <InventoryShell
        title={t("wms.permintaan.title")}
        subtitle={t("wms.permintaan.subtitle")}
        module="wms"
      >
        <PermintaanBarangTabs />
        {children}
      </InventoryShell>
    </InventoryGate>
  );
}
