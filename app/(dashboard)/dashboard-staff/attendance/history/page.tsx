"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardStaffAttendanceHistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/attendance/history");
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Mengalihkan ke riwayat absensi…
    </div>
  );
}
