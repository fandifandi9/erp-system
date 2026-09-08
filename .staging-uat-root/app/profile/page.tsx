"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";
import { EmployeeSelfProfile } from "@/components/EmployeeSelfProfile";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";
import { LocaleProvider } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function ProfilePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const sync = () => {
      const u = pb.authStore.model as Record<string, unknown> | null;
      if (!u) {
        router.replace("/login");
        return;
      }
      if (!canAccess(u, "/profile")) {
        router.replace(getDefaultRouteForUser(u));
        return;
      }
      setSessionUser(u);
      setReady(true);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, [router]);

  if (!ready || !sessionUser) {
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <StandaloneAppHeader subtitle="Profil" />
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Memuat profil…
        </div>
      </div>
    );
  }

  return (
    <LocaleProvider>
      <div className="min-h-[100dvh] bg-slate-50">
        <StandaloneAppHeader
          subtitle="Profil"
          endSlot={
            <>
              <LanguageSwitcher compact />
              <StandalonePortalActions omitProfile />
            </>
          }
        />
        <EmployeeSelfProfile />
      </div>
    </LocaleProvider>
  );
}
