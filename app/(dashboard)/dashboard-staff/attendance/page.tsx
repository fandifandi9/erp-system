"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardStaffAttendanceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/attendance");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Mengalihkan ke absensi…
    </div>
  );
}
