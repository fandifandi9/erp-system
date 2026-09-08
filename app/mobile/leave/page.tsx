"use client";

import { StaffLeaveModule } from "@/app/(dashboard)/dashboard-staff/leave/page";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobileLeavePage() {
  return (
    <MobileContentShell>
      <StaffLeaveModule basePath="/mobile/leave" />
    </MobileContentShell>
  );
}
