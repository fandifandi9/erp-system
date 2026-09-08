"use client";

import StaffPayrollPage from "@/app/(dashboard)/dashboard-staff/payroll/page";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobilePayrollPage() {
  return (
    <MobileContentShell>
      <StaffPayrollPage />
    </MobileContentShell>
  );
}
