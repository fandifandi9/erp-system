/**
 * Phase 35I — Canonical ERP module registry.
 * Maps modules to existing web paths and capability keys only (no new permissions).
 */

import type { ModuleId, PermissionKey } from "@/lib/access/types";
import { EMPLOYEE_CAPABILITIES } from "@/lib/capabilities/employee";
import { ATTENDANCE_CAPABILITIES } from "@/lib/capabilities/attendance";
import { SCHEDULE_CAPABILITIES } from "@/lib/capabilities/schedule";
import { PAYSLIP_CAPABILITIES } from "@/lib/capabilities/payroll";
import { HR_POLICY_CAPABILITIES } from "@/lib/capabilities/hr-policy";
import { EMPLOYEE_DOCUMENT_CAPABILITIES } from "@/lib/capabilities/employee-document";
import { MASTER_DATA_CAPABILITIES } from "@/lib/capabilities/master-data";

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  /** Desk workbench group id in lib/workspace/desk-modules.ts (if any). */
  deskModuleId?: string;
  /** Web route prefixes granted in FULL mode. */
  webPathPrefixes: string[];
  /** Existing capability registry keys granted in FULL mode. */
  capabilityKeys: PermissionKey[];
};

const HR_FULL_CAPABILITIES: PermissionKey[] = [
  ...EMPLOYEE_CAPABILITIES.filter(
    (c) => c !== "employee.activate" && c !== "employee.deactivate" && c !== "employee.manage_hr_accounts",
  ),
  ...ATTENDANCE_CAPABILITIES.filter((c) => c === "attendance.view_team" || c === "attendance.manage"),
  ...SCHEDULE_CAPABILITIES,
  "payslip.view_scoped",
  "payslip.download_scoped",
  "hr_policy.manage",
  "employee_document.view_scoped",
  "employee_document.download_scoped",
  "master_data.entity.view",
  "master_data.membership.assign",
];

const HR_WEB_PATHS = [
  "/hr",
  "/hr/employees",
  "/hr/attendance",
  "/hr/attendance/suspicious",
  "/hr/payroll",
  "/hr/leave",
  "/hr/overtime",
  "/hr/compensation/settings",
  "/hr/work-calendar",
  "/hr/leave/settings",
  "/hr/field-activity",
  "/hr/izin-off",
  "/hr/org-structure",
  "/pengaturan/organisasi",
  "/hr/offices",
  "/hr/profile",
  "/hr/rating",
  "/hr/findings",
  "/laporan/sdm",
];

const FINANCE_WEB_PATHS = [
  "/keuangan",
  "/keuangan/kas-bank",
  "/keuangan/pemasukan",
  "/keuangan/piutang",
  "/keuangan/hutang",
  "/keuangan/transfer",
  "/keuangan/rekonsiliasi",
  "/keuangan/arus-kas",
];

const WAREHOUSE_WEB_PATHS = [
  "/gudang",
  "/wms",
  "/inventory/stock",
  "/inventory/movements",
  "/inventory/zones",
  "/inventory/activities",
];

const PURCHASING_WEB_PATHS = ["/pembelian", "/bisnis/pembelian", "/bisnis/purchase-order"];

const SALES_WEB_PATHS = [
  "/penjualan",
  "/bisnis/penjualan",
  "/bisnis/invoice",
  "/bisnis/laporan-penjualan",
];

const POS_WEB_PATHS = ["/pos", "/bisnis/pos-registers", "/bisnis/penjualan"];

/** Prefix web paths as permission keys for CUSTOM mode on path-only modules. */
export function webPathPermissionKey(prefix: string): PermissionKey {
  return `web:${prefix}`;
}

function pathsToWebPermissionKeys(paths: readonly string[]): PermissionKey[] {
  return paths.map(webPathPermissionKey);
}

export const MODULE_REGISTRY: Record<ModuleId, ModuleDefinition> = {
  hr: {
    id: "hr",
    label: "HR",
    deskModuleId: "hr",
    webPathPrefixes: HR_WEB_PATHS,
    capabilityKeys: HR_FULL_CAPABILITIES,
  },
  finance: {
    id: "finance",
    label: "Finance",
    deskModuleId: "finance",
    webPathPrefixes: FINANCE_WEB_PATHS,
    capabilityKeys: pathsToWebPermissionKeys(FINANCE_WEB_PATHS),
  },
  warehouse: {
    id: "warehouse",
    label: "Warehouse",
    deskModuleId: "warehouse",
    webPathPrefixes: WAREHOUSE_WEB_PATHS,
    capabilityKeys: pathsToWebPermissionKeys(WAREHOUSE_WEB_PATHS),
  },
  purchasing: {
    id: "purchasing",
    label: "Purchasing",
    webPathPrefixes: PURCHASING_WEB_PATHS,
    capabilityKeys: pathsToWebPermissionKeys(PURCHASING_WEB_PATHS),
  },
  sales: {
    id: "sales",
    label: "Sales",
    webPathPrefixes: SALES_WEB_PATHS,
    capabilityKeys: pathsToWebPermissionKeys(SALES_WEB_PATHS),
  },
  pos: {
    id: "pos",
    label: "POS",
    webPathPrefixes: POS_WEB_PATHS,
    capabilityKeys: pathsToWebPermissionKeys(POS_WEB_PATHS),
  },
};

export function getModuleDefinition(moduleId: ModuleId): ModuleDefinition {
  return MODULE_REGISTRY[moduleId];
}

export function isKnownModuleId(value: string): value is ModuleId {
  return value in MODULE_REGISTRY;
}

/** All valid permission keys for a module (FULL catalog). */
export function listModulePermissionCatalog(moduleId: ModuleId): PermissionKey[] {
  const def = MODULE_REGISTRY[moduleId];
  return [...new Set([...def.capabilityKeys, ...def.webPathPrefixes.map(webPathPermissionKey)])];
}
