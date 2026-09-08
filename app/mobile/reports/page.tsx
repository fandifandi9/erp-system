"use client";

import { ReportingListPage } from "@/components/hr/ReportingListPage";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobileReportsPage() {
  return (
    <MobileContentShell>
      <ReportingListPage kind="report" />
    </MobileContentShell>
  );
}
