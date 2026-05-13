"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Satu URL profil untuk semua peran: `/profile`. */
export default function HrProfileRedirectPage() {
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
