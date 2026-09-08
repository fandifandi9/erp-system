"use client";

import { usePathname } from "next/navigation";
import { resolveInventoryModule } from "@/lib/wms/navigation";
import { ErpInventoryShell } from "@/components/inventory/ErpInventoryShell";
import { WmsShell } from "@/components/wms/WmsShell";

/** Router shell: ERP Core vs WMS Operation berdasarkan path. */
export function InventoryShell({
  title,
  subtitle,
  children,
  module: moduleOverride,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  module?: "erp" | "wms";
  hideNav?: boolean;
}) {
  const pathname = usePathname();
  const module = moduleOverride ?? resolveInventoryModule(pathname);

  if (module === "wms") {
    return (
      <WmsShell title={title} subtitle={subtitle}>
        {children}
      </WmsShell>
    );
  }

  return (
    <ErpInventoryShell title={title} subtitle={subtitle}>
      {children}
    </ErpInventoryShell>
  );
}
