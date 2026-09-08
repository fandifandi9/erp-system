"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccessCatalog } from "@/lib/catalog/catalog-access";
import { getDefaultRouteForUser } from "@/lib/rbac";
import { Loader2 } from "lucide-react";

export function CatalogGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const user = pb.authStore.model;
    if (!pb.authStore.isValid || !user) {
      router.replace("/login");
      return;
    }
    if (!canAccessCatalog(user)) {
      router.replace(getDefaultRouteForUser(user));
      return;
    }
    if (!cancelled) setOk(true);
    return () => {
      cancelled = true;
    };
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
