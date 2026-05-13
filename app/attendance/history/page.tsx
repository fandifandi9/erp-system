"use client";

import AttendanceHistoryUserView from "@/components/AttendanceHistoryUserView";
import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";

export default function AttendanceHistoryPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <StandaloneAppHeader
        subtitle="Riwayat absensi"
        endSlot={<StandalonePortalActions />}
      />
      <AttendanceHistoryUserView />
    </div>
  );
}
