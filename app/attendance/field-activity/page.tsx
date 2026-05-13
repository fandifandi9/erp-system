"use client";

import StandaloneAppHeader from "@/components/StandaloneAppHeader";
import { StandalonePortalActions } from "@/components/StandalonePortalActions";
import FieldActivityStaffPanel from "@/components/FieldActivityStaffPanel";

export default function AttendanceFieldActivityPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <StandaloneAppHeader
        subtitle="Aktivitas luar kantor"
        endSlot={<StandalonePortalActions />}
      />
      <FieldActivityStaffPanel />
    </div>
  );
}
