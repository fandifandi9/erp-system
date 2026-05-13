"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Aktivitas luar kantor dipindah ke zona absensi mandiri: `/attendance/field-activity`. */
export default function StaffFieldActivityRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/attendance/field-activity");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
      Mengalihkan ke absensi → aktivitas luar kantor…
    </div>
  );
}
