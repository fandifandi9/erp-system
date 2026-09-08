"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canAccess, hasHrFullWorkspaceAccess } from "@/lib/rbac";
import { hasHrPositionWorkspaceDomain } from "@/lib/org/hr-workspace-access";
import { useLocale } from "@/components/LocaleProvider";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { WorkspaceHeader } from "@/components/ui/workspace-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StaffWorkspaceRail } from "@/components/workspace/StaffWorkspaceRail";
import { StaffDashboardOverview } from "@/components/workspace/StaffDashboardOverview";
import { MySubmissionsPanel } from "@/components/hr/MySubmissionsPanel";
import { staffWorkspaceConfig } from "@/lib/workspace/workspaces/staff";

export function StaffWorkspaceView() {
  const { t } = useLocale();
  const router = useRouter();
  const user = pb.authStore.model as Record<string, unknown> | null;
  const showStaffMenu = user && canAccess(user, "/dashboard-staff");
  const isHrFull = user
    ? hasHrFullWorkspaceAccess(user) || hasHrPositionWorkspaceDomain(user)
    : false;

  const displayName = useMemo(() => {
    const name = String(user?.name ?? "").trim();
    return name || String(user?.email ?? "").split("@")[0] || "";
  }, [user]);

  // Phase NEXT-FIX — HR Full never stays on Staff home (shell + strip).
  useEffect(() => {
    if (isHrFull) {
      router.replace("/hr");
    }
  }, [isHrFull, router]);

  if (isHrFull) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Mengalihkan ke HR Workspace…
      </div>
    );
  }

  if (!showStaffMenu || !user) {
    return (
      <WorkspaceLayout
        header={
          <WorkspaceHeader
            title={t("workspace.staff.dashboard.title")}
            subtitle={t("workspace.staff.dashboard.subtitle")}
          />
        }
      >
        <EmptyState
          title={t("workspace.staff.noAccess.title")}
          description={t("workspace.staff.noAccess.desc")}
        />
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout
      className="space-y-2 p-0"
      maxWidth="max-w-none"
      header={
        <WorkspaceHeader
          compact
          title={t(staffWorkspaceConfig.titleKey)}
          subtitle="Desktop = workspace ERP. Personal overview di bawah; tugas mendesak di Meja Kerja (sidebar)."
        />
      }
    >
      <div className="space-y-2.5">
        <div className="grid gap-2.5 lg:grid-cols-12 lg:items-start">
          <div className="space-y-2.5 lg:col-span-8 xl:col-span-9">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Personal overview
            </p>
            <StaffDashboardOverview displayName={displayName} />
            <MySubmissionsPanel limit={6} />
          </div>

          <aside className="lg:col-span-4 xl:col-span-3">
            <StaffWorkspaceRail />
          </aside>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
