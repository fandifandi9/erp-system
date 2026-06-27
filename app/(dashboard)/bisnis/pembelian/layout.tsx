"use client";

import { usePathname } from "next/navigation";
import { PurchaseModuleHeader } from "@/components/bisnis/PurchaseModuleHeader";
import { PurchaseModuleTabs } from "@/components/bisnis/PurchaseModuleTabs";
import { isPurchaseModuleChromePath } from "@/lib/bisnis/module-routes";

export default function PembelianLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showChrome = isPurchaseModuleChromePath(pathname);

  return (
    <div className="min-h-screen">
      {showChrome ? (
        <>
          <PurchaseModuleHeader />
          <PurchaseModuleTabs />
        </>
      ) : null}
      {children}
    </div>
  );
}
