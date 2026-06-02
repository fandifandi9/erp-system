"use client";

import { FileStack } from "lucide-react";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import { WmsCard, WmsEmpty, WmsBadge } from "@/components/wms/ui";

export default function WmsRequestsPage() {
  return (
    <InventoryGate>
      <InventoryShell
        title="Permintaan gudang"
        subtitle="Transfer antar gudang, permintaan stok internal, dan approval supervisor."
        module="wms"
      >
        <WmsEmpty
          title="Modul permintaan gudang"
          description="Workflow permintaan akan terhubung ke mutasi TRANSFER dan approval. Gunakan mutasi stok sementara."
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
