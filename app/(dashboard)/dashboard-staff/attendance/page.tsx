"use client";

import { Suspense } from "react";
import { DesktopAttendancePanel } from "@/components/hr/DesktopAttendancePanel";

export default function StaffAttendancePage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Suspense fallback={<p className="text-slate-500">Memuat absensi…</p>}>
        <DesktopAttendancePanel />
      </Suspense>
    </div>
  );
}
