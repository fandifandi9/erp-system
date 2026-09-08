"use client";

import { Suspense } from "react";
import { DesktopAttendancePanel } from "@/components/hr/DesktopAttendancePanel";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobileAttendancePage() {
  return (
    <MobileContentShell>
      <Suspense fallback={<p className="text-sm text-slate-500">Memuat absensi…</p>}>
        <DesktopAttendancePanel stayInPlace />
      </Suspense>
    </MobileContentShell>
  );
}
