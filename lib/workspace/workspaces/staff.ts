import {
  Banknote,
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  Clock,
  Moon,
  Navigation,
  User,
} from "lucide-react";
import type { WorkspaceConfig } from "@/lib/workspace/types";

/**
 * Staff workspace shell config.
 * - commonSections: sidebar navigation (attendance, payroll, company)
 * - roleSections: Meja Kerja additional modules (permission-based, empty for staff)
 */
export const staffWorkspaceConfig: WorkspaceConfig = {
  id: "staff",
  titleKey: "workspace.staff.dashboard.title",
  subtitleKey: "workspace.staff.dashboard.subtitle",
  commonSections: [
    {
      id: "attendance",
      titleKey: "workspace.staff.section.attendance",
      actionIds: ["attendance", "leave", "overtime", "field-activity", "izin-off", "my-submissions", "reports"],
    },
    { id: "payroll", titleKey: "workspace.staff.section.payroll", actionIds: ["payroll"] },
    {
      id: "company",
      titleKey: "workspace.staff.section.company",
      actionIds: ["policies", "holidays"],
    },
  ],
  roleSections: [],
  quickActions: [
    {
      id: "profile",
      titleKey: "workspace.staff.action.profile.title",
      descriptionKey: "workspace.staff.action.profile.desc",
      href: "/profile",
      icon: User,
      accessPath: "/profile",
    },
    {
      id: "my-submissions",
      titleKey: "workspace.staff.action.mySubmissions.title",
      descriptionKey: "workspace.staff.action.mySubmissions.desc",
      href: "/dashboard-staff/my-submissions",
      icon: ClipboardCheck,
      accessPath: "/dashboard-staff",
    },
    {
      id: "reports",
      titleKey: "workspace.staff.action.reports.title",
      descriptionKey: "workspace.staff.action.reports.desc",
      href: "/hr/reports",
      icon: ClipboardCheck,
      accessPath: "/hr/reports",
    },
    {
      id: "attendance",
      titleKey: "workspace.staff.action.attendance.title",
      descriptionKey: "workspace.staff.action.attendance.desc",
      href: "/dashboard-staff/attendance",
      icon: Clock,
      accessPath: "/dashboard-staff/attendance",
    },
    {
      id: "leave",
      titleKey: "workspace.staff.action.leave.title",
      descriptionKey: "workspace.staff.action.leave.desc",
      href: "/dashboard-staff/leave",
      icon: Calendar,
      accessPath: "/dashboard-staff/leave",
    },
    {
      id: "overtime",
      titleKey: "workspace.staff.action.overtime.title",
      descriptionKey: "workspace.staff.action.overtime.desc",
      href: "/dashboard-staff/overtime",
      icon: Moon,
      accessPath: "/dashboard-staff/overtime",
    },
    {
      id: "field-activity",
      titleKey: "workspace.staff.action.field.title",
      descriptionKey: "workspace.staff.action.field.desc",
      href: "/dashboard-staff/field-activity",
      icon: Navigation,
      accessPath: "/dashboard-staff/field-activity",
    },
    {
      id: "izin-off",
      titleKey: "workspace.staff.action.izinOff.title",
      descriptionKey: "workspace.staff.action.izinOff.desc",
      href: "/dashboard-staff/izin-off",
      icon: CalendarDays,
      accessPath: "/dashboard-staff",
    },
    {
      id: "payroll",
      titleKey: "workspace.staff.action.payroll.title",
      descriptionKey: "workspace.staff.action.payroll.desc",
      href: "/dashboard-staff/payroll",
      icon: Banknote,
      accessPath: "/dashboard-staff/payroll",
    },
    {
      id: "policies",
      titleKey: "workspace.staff.action.policies.title",
      descriptionKey: "workspace.staff.action.policies.desc",
      href: "/dashboard-staff/policies",
      icon: BookOpen,
      accessPath: "/dashboard-staff/policies",
    },
    {
      id: "holidays",
      titleKey: "workspace.staff.action.holidays.title",
      descriptionKey: "workspace.staff.action.holidays.desc",
      href: "/dashboard-staff/holidays",
      icon: CalendarDays,
      accessPath: "/dashboard-staff/holidays",
    },
  ],
};
