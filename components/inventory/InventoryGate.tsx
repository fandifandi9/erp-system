"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccessInventory } from "@/lib/inventory/access";
import { getDefaultRouteForUser } from "@/lib/rbac";
import { Loader2 } from "lucide-react";

export function InventoryGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const user = pb.authStore.model;
    if (!pb.authStore.isValid || !user) {
      router.replace("/login");
      return;
    }
    if (!canAccessInventory(user)) {
      router.replace(getDefaultRouteForUser(user));
      return;
    }
    setOk(true);
  }, [router]);

  if (!ok) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return <>{children}</>;
}
