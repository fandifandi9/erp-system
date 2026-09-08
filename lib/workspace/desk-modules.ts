/**
 * Meja Kerja — contextual workbench module definitions.
 * Resolved via canAccess() + capability catalog; no role string branching.
 */

import type { PermissionKey } from "@/lib/access/types";

export type DeskContextualItem = {
  id: string;
  titleKey: string;
  descriptionKey?: string;
  href: string;
  /** Path prefix for canAccess() */
  accessPath: string;
  /** Optional capability from existing catalog — visibility only (not a new permission). */
  requiredCapability?: PermissionKey;
  /** When set, summary API may populate badge count for this item. */
  summaryKey?:
    | "pendingLeave"
    | "suspiciousAttendance"
    | "openFindings"
    | "pendingRecruitmentApprovals"
    | "pendingOvertime";
};

export type DeskModuleDefinition = {
  id: string;
  titleKey: string;
  fullModuleHref: string;
  fullModuleAccessPath: string;
  fullModuleLabelKey: string;
  items: DeskContextualItem[];
};

export const DESK_MODULE_DEFINITIONS: DeskModuleDefinition[] = [
  {
    id: "hr",
    titleKey: "workspace.staff.desk.module.hr",
    fullModuleHref: "/hr",
    fullModuleAccessPath: "/hr",
    fullModuleLabelKey: "workspace.staff.desk.open.hr",
    items: [
      {
        id: "hr-recruitment-approve",
        titleKey: "workspace.staff.desk.hr.recruitmentApprove.title",
        descriptionKey: "workspace.staff.desk.hr.recruitmentApprove.desc",
        href: "/hr/recruitment-approvals",
        accessPath: "/hr/employees",
        summaryKey: "pendingRecruitmentApprovals",
      },
      {
        id: "hr-leave-review",
        titleKey: "workspace.staff.desk.hr.leaveReview.title",
        descriptionKey: "workspace.staff.desk.hr.leaveReview.desc",
        href: "/hr/leave",
        accessPath: "/hr/leave",
        summaryKey: "pendingLeave",
      },
      {
        id: "hr-overtime-review",
        titleKey: "workspace.staff.desk.hr.overtimeReview.title",
        descriptionKey: "workspace.staff.desk.hr.overtimeReview.desc",
        href: "/hr/overtime",
        accessPath: "/hr/overtime",
        summaryKey: "pendingOvertime",
      },
      {
        id: "hr-attendance-review",
        titleKey: "workspace.staff.desk.hr.attendanceReview.title",
        descriptionKey: "workspace.staff.desk.hr.attendanceReview.desc",
        href: "/hr/attendance/suspicious",
        accessPath: "/hr/attendance/suspicious",
        requiredCapability: "attendance.view_team",
        summaryKey: "suspiciousAttendance",
      },
      {
        id: "hr-findings",
        titleKey: "workspace.staff.desk.hr.findings.title",
        descriptionKey: "workspace.staff.desk.hr.findings.desc",
        href: "/hr/findings",
        accessPath: "/hr/findings",
        summaryKey: "openFindings",
      },
      {
        id: "hr-employees",
        titleKey: "workspace.staff.desk.hr.employees.title",
        descriptionKey: "workspace.staff.desk.hr.employees.desc",
        href: "/hr/employees",
        accessPath: "/hr/employees",
        requiredCapability: "employee.view",
      },
    ],
  },
  {
    id: "finance",
    titleKey: "workspace.staff.desk.module.finance",
    fullModuleHref: "/keuangan",
    fullModuleAccessPath: "/keuangan",
    fullModuleLabelKey: "workspace.staff.desk.open.finance",
    items: [
      {
        id: "finance-invoice",
        titleKey: "workspace.staff.desk.finance.invoice.title",
        descriptionKey: "workspace.staff.desk.finance.invoice.desc",
        href: "/keuangan/piutang",
        accessPath: "/keuangan/piutang",
      },
      {
        id: "finance-payment",
        titleKey: "workspace.staff.desk.finance.payment.title",
        descriptionKey: "workspace.staff.desk.finance.payment.desc",
        href: "/keuangan/kas-bank",
        accessPath: "/keuangan/kas-bank",
      },
      {
        id: "finance-reconciliation",
        titleKey: "workspace.staff.desk.finance.reconciliation.title",
        descriptionKey: "workspace.staff.desk.finance.reconciliation.desc",
        href: "/keuangan/rekonsiliasi",
        accessPath: "/keuangan/rekonsiliasi",
      },
    ],
  },
  {
    id: "warehouse",
    titleKey: "workspace.staff.desk.module.warehouse",
    fullModuleHref: "/gudang",
    fullModuleAccessPath: "/gudang",
    fullModuleLabelKey: "workspace.staff.desk.open.warehouse",
    items: [
      {
        id: "warehouse-opname",
        titleKey: "workspace.staff.desk.warehouse.opname.title",
        descriptionKey: "workspace.staff.desk.warehouse.opname.desc",
        href: "/gudang/opname",
        accessPath: "/gudang/opname",
      },
      {
        id: "warehouse-transfer",
        titleKey: "workspace.staff.desk.warehouse.transfer.title",
        descriptionKey: "workspace.staff.desk.warehouse.transfer.desc",
        href: "/gudang/transfer",
        accessPath: "/gudang/transfer",
      },
      {
        id: "warehouse-receiving",
        titleKey: "workspace.staff.desk.warehouse.receiving.title",
        descriptionKey: "workspace.staff.desk.warehouse.receiving.desc",
        href: "/gudang/penerimaan",
        accessPath: "/gudang/penerimaan",
      },
      {
        id: "warehouse-picking",
        titleKey: "workspace.staff.desk.warehouse.picking.title",
        descriptionKey: "workspace.staff.desk.warehouse.picking.desc",
        href: "/gudang/picking",
        accessPath: "/gudang/picking",
      },
    ],
  },
];
