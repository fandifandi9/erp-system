"use client";

import { usePathname } from "next/navigation";
import { SalesModuleHeader } from "@/components/bisnis/SalesModuleHeader";
import { SalesStoreScopeProvider } from "@/components/bisnis/SalesStoreScopeContext";
import { isSalesModuleChromePath } from "@/lib/bisnis/module-routes";

export default function PenjualanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showChrome = isSalesModuleChromePath(pathname);

  return (
    <div className="min-h-screen">
      {showChrome ? (
        <SalesStoreScopeProvider>
          <SalesModuleHeader />
          {children}
        </SalesStoreScopeProvider>
      ) : (
        children
      )}
    </div>
  );
}
