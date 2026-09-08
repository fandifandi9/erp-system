"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import {
  canAccessInventory,
  getDefaultInventoryRoute,
  isWarehouseStaffOnly,
} from "@/lib/inventory/access";
import { ERP_INVENTORY_CORE_PATHS } from "@/lib/inventory/access";
import { getDefaultRouteForUser } from "@/lib/rbac";
import { Loader2 } from "lucide-react";

function isErpCoreOnlyPath(pathname: string): boolean {
  if (pathname === "/inventory" || pathname === "/inventory/") return true;
  return ERP_INVENTORY_CORE_PATHS.some(
    (p) => p !== "/inventory" && (pathname === p || pathname.startsWith(p + "/"))
  );
}

export function InventoryGate({
  children,
  requireErpCore,
}: {
  children: React.ReactNode;
  requireErpCore?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      const user = pb.authStore.model;
      if (!pb.authStore.isValid || !user) {
        router.replace("/login");
        return;
      }
      if (!canAccessInventory(user)) {
        router.replace(getDefaultRouteForUser(user));
        return;
      }
      const blockStaffFromErp =
        (requireErpCore || isErpCoreOnlyPath(pathname)) && isWarehouseStaffOnly(user);
      if (blockStaffFromErp) {
        router.replace(getDefaultInventoryRoute(user));
        return;
      }
      if (!cancelled) setOk(true);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, pathname, requireErpCore]);

  if (!ok) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return <>{children}</>;
}
