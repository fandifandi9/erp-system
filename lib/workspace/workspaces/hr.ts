import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  Moon,
  Network,
  Star,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { WorkspaceConfig } from "@/lib/workspace/types";

/**
 * HR-STAFF-01 — True HR Desktop Workspace config.
 * Primary = operational HR (capability-filtered). Personal is not primary nav.
 */
export const hrWorkspaceConfig: WorkspaceConfig = {
  id: "hr",
  titleKey: "workspace.hr.dashboard.title",
  subtitleKey: "workspace.hr.dashboard.subtitle",
  commonSections: [
    {
      id: "sdm",
      titleKey: "workspace.hr.section.sdm",
      actionIds: ["hr-employees", "hr-org", "hr-recruitment"],
    },
    {
      id: "attendance-work",
      titleKey: "workspace.hr.section.attendanceWork",
      actionIds: [
        "hr-attendance",
        "hr-leave",
        "hr-overtime",
        "hr-izin-off",
        "hr-field",
        "hr-schedule",
        "hr-suspicious",
      ],
    },
    {
      id: "reports",
      titleKey: "workspace.hr.section.reports",
      actionIds: ["hr-reports", "hr-findings", "hr-rating"],
    },
  ],
  /** Personal not primary for HR Full — profile via topbar; personal routes remain valid. */
  personalSection: undefined,
  roleSections: [],
  quickActions: [
    {
      id: "hr-dashboard",
      titleKey: "workspace.hr.action.dashboard",
      href: "/hr",
      icon: LayoutDashboard,
      accessPath: "/hr",
    },
    {
      id: "hr-employees",
      titleKey: "workspace.hr.action.employees",
      href: "/hr/employees",
      icon: UserCheck,
      accessPath: "/hr/employees",
    },
    {
      id: "hr-org",
      titleKey: "workspace.hr.action.org",
      href: "/pengaturan/organisasi",
      icon: Network,
      accessPath: "/pengaturan/organisasi",
    },
    {
      id: "hr-recruitment",
      titleKey: "workspace.hr.action.recruitment",
      href: "/hr/recruitment-approvals",
      icon: UserPlus,
      accessPath: "/hr/recruitment-approvals",
    },
    {
      id: "hr-attendance",
      titleKey: "workspace.hr.action.attendance",
      href: "/hr/attendance",
      icon: Clock,
      accessPath: "/hr/attendance",
    },
    {
      id: "hr-leave",
      titleKey: "workspace.hr.action.leave",
      href: "/hr/leave",
      icon: Calendar,
      accessPath: "/hr/leave",
    },
    {
      id: "hr-overtime",
      titleKey: "workspace.hr.action.overtime",
      href: "/hr/overtime",
      icon: Moon,
      accessPath: "/hr/overtime",
    },
    {
      id: "hr-izin-off",
      titleKey: "workspace.hr.action.izinOff",
      href: "/hr/izin-off",
      icon: CalendarDays,
      accessPath: "/hr/izin-off",
    },
    {
      id: "hr-field",
      titleKey: "workspace.hr.action.field",
      href: "/hr/field-activity",
      icon: Briefcase,
      accessPath: "/hr/field-activity",
    },
    {
      id: "hr-findings",
      titleKey: "workspace.hr.action.findings",
      href: "/hr/findings",
      icon: AlertTriangle,
      accessPath: "/hr/findings",
    },
    {
      id: "hr-rating",
      titleKey: "workspace.hr.action.rating",
      href: "/hr/rating",
      icon: Star,
      accessPath: "/hr/rating",
    },
    {
      id: "hr-reports",
      titleKey: "workspace.hr.action.reports",
      href: "/laporan/sdm",
      icon: ClipboardCheck,
      accessPath: "/laporan/sdm",
    },
    {
      id: "hr-suspicious",
      titleKey: "workspace.hr.action.suspicious",
      href: "/hr/attendance/suspicious",
      icon: AlertTriangle,
      accessPath: "/hr/attendance/suspicious",
    },
    {
      id: "hr-schedule",
      titleKey: "workspace.hr.action.schedule",
      href: "/hr/work-calendar",
      icon: CalendarDays,
      accessPath: "/hr/work-calendar",
    },
  ],
};
