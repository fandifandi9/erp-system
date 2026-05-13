"use client";

import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { canAccess } from "@/lib/rbac";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";

/** Header konsisten untuk modul karyawan di luar layout dashboard (HP). */
export function StandaloneEmployeeShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const sync = () =>
      setSessionUser((pb.authStore.model as Record<string, unknown> | null) ?? null);
    sync();
    return pb.authStore.onChange(sync);
  }, []);

  const headerHomeHref = useMemo(() => {
    if (sessionUser && canAccess(sessionUser, "/profile")) return "/profile";
    return "/attendance";
  }, [sessionUser]);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <StandaloneAppHeader
        subtitle={subtitle}
        homeHref={headerHomeHref}
        endSlot={<StandalonePortalActions showLogout />}
      />
      {children}
    </div>
  );
}
