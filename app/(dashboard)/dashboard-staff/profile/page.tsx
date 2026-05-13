"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Profil mandiri ada di `/profile` — rute ini mempertahankan bookmark lama. */
export default function DashboardStaffProfileRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/profile");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Mengalihkan ke profil…
    </div>
  );
}
