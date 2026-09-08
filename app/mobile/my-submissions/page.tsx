"use client";

import { MySubmissionsPanel } from "@/components/hr/MySubmissionsPanel";
import { MobileContentShell } from "@/components/mobile/MobileContentShell";

export default function MobileMySubmissionsPage() {
  return (
    <MobileContentShell>
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pengajuan Saya</h1>
          <p className="mt-1 text-sm text-slate-600">
            Status cuti, lembur, dan off — data sama dengan app.
          </p>
        </div>
        <MySubmissionsPanel limit={0} showHeaderLink={false} />
      </div>
    </MobileContentShell>
  );
}
