"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { canAccess, getDefaultRouteForUser } from "@/lib/rbac";
import { EmployeeSelfProfile } from "@/components/EmployeeSelfProfile";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ToastProvider } from "@/components/ui/toast";

export default function ProfilePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<Record<string, unknown> | null>(null);
  const [authInvalid, setAuthInvalid] = useState(false);

  useEffect(() => {
    const sync = () => {
      const u = pb.authStore.model as Record<string, unknown> | null;
      if (!u || !pb.authStore.isValid) {
        setAuthInvalid(true);
        setReady(true);
        return;
      }
      if (!canAccess(u, "/profile")) {
        router.replace(getDefaultRouteForUser(u));
        return;
      }
      setAuthInvalid(false);
      setSessionUser(u);
      setReady(true);
    };
    sync();
    return pb.authStore.onChange(sync);
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-[100dvh] bg-erp-bg">
        <StandaloneAppHeader subtitle="Profil" />
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Memuat profil…
        </div>
      </div>
    );
  }

  if (authInvalid || !sessionUser) {
    return (
      <div className="min-h-[100dvh] bg-erp-bg">
        <StandaloneAppHeader subtitle="Profil" />
        <div className="mx-auto max-w-md space-y-4 p-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Sesi login tidak valid atau sudah berakhir. Login ulang dengan akun yang benar.
          </div>
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Ke halaman login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <LocaleProvider>
      <ToastProvider>
      <div className="min-h-[100dvh] bg-erp-bg">
        <StandaloneAppHeader
          subtitle="Profil"
          endSlot={
            <>
              <StandalonePortalActions omitProfile showLogout />
            </>
          }
        />
        <EmployeeSelfProfile />
      </div>
      </ToastProvider>
    </LocaleProvider>
  );
}
