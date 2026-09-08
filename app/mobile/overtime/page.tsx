"use client";

import StaffOvertimePage from "@/app/(dashboard)/dashboard-staff/overtime/page";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobileOvertimePage() {
  return (
    <MobileContentShell>
      <StaffOvertimePage />
    </MobileContentShell>
  );
}
