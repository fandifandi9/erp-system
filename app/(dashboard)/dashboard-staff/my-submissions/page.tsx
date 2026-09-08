"use client";

import { MySubmissionsPanel } from "@/components/hr/MySubmissionsPanel";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { WorkspaceHeader } from "@/components/ui/workspace-header";

export default function StaffMySubmissionsPage() {
  return (
    <WorkspaceLayout
      header={
        <WorkspaceHeader
          title="Pengajuan Saya"
          subtitle="Status cuti, lembur, dan izin/off Anda — data dari server yang sama dengan Mobile."
        />
      }
    >
      <MySubmissionsPanel limit={0} showHeaderLink={false} />
    </WorkspaceLayout>
  );
}
