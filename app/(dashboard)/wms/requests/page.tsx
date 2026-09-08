"use client";

import { FileStack } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard, WmsEmpty, WmsBadge } from "@/components/wms/ui";
import { useLocale } from "@/components/LocaleProvider";

export default function WmsRequestsPage() {
  const { t } = useLocale();
  return (
    <InventoryGate>
      <InventoryShell
        title={t("inventory.requests.title")}
        subtitle={t("inventory.requests.subtitle")}
        module="wms"
      >
        <WmsEmpty
          title={t("inventory.requests.title")}
          description={t("inventory.requests.subtitle")}
          action={<WmsBadge tone="indigo">Fase berikutnya — engine stok siap</WmsBadge>}
        />
        <WmsCard>
          <p className="text-sm text-slate-600">
            Sementara: buat <strong>mutasi transfer</strong> atau <strong>adjustment</strong> dari menu mutasi
            stok dengan catatan permintaan internal.
          </p>
        </WmsCard>
      </InventoryShell>
    </InventoryGate>
  );
}
