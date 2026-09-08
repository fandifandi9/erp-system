/**
 * Phase 35I-B0 / 35I-C — Human-friendly capability catalog for Owner module assignment UI.
 * HR CUSTOM shows business capabilities only (no web:/ technical paths as primary choices).
 */

import type { ModuleId, PermissionKey } from "@/lib/access/types";
import { MODULE_REGISTRY, listModulePermissionCatalog } from "@/lib/access/module-registry";
import { isOwnerOnlyModuleCapability } from "@/lib/access/owner-only-capabilities";
import { isTechnicalWebPermissionKey } from "@/lib/access/business-capability-map";
import { EMPLOYEE_CAPABILITY_DEFS } from "@/lib/capabilities/employee";
import { ATTENDANCE_CAPABILITY_DEFS } from "@/lib/capabilities/attendance";
import { SCHEDULE_CAPABILITY_DEFS } from "@/lib/capabilities/schedule";

export type CapabilityUiOption = {
  key: PermissionKey;
  label: string;
};

export type CapabilityUiGroup = {
  id: string;
  label: string;
  options: CapabilityUiOption[];
};

export type ModuleUiCatalog = {
  id: ModuleId;
  label: string;
  groups: CapabilityUiGroup[];
};

const PAYSLIP_LABELS: Record<string, string> = {
  "payslip.view_scoped": "Lihat slip gaji (scope)",
  "payslip.download_scoped": "Unduh slip gaji (scope)",
};

const HR_POLICY_LABELS: Record<string, string> = {
  "hr_policy.view_published": "Lihat kebijakan HR (publik)",
  "hr_policy.manage": "Kelola kebijakan HR",
};

const DOCUMENT_LABELS: Record<string, string> = {
  "employee_document.view_scoped": "Lihat dokumen karyawan (scope)",
  "employee_document.download_scoped": "Unduh dokumen karyawan (scope)",
};

const MASTER_DATA_LABELS: Record<string, string> = {
  "master_data.entity.view": "Lihat data entitas",
  "master_data.membership.assign": "Kelola keanggotaan entitas",
};

const EMPLOYEE_UI_LABELS: Partial<Record<string, string>> = {
  "employee.view": "Lihat Karyawan",
  "employee.create": "Buat Karyawan",
  "employee.update": "Edit Karyawan",
  "employee.view_sensitive": "Lihat Data Sensitif Karyawan",
  "employee.manage_accounts": "Kelola Akun Karyawan",
  "employee.assign_manager": "Tetapkan Atasan",
  "employee.view_team": "Lihat Tim Karyawan",
};

const ATTENDANCE_UI_LABELS: Partial<Record<string, string>> = {
  "attendance.view_team": "Lihat Kehadiran Tim",
  "attendance.manage": "Kelola Kehadiran",
};

function labelForKey(key: PermissionKey): string {
  if (EMPLOYEE_UI_LABELS[key]) return EMPLOYEE_UI_LABELS[key]!;
  if (ATTENDANCE_UI_LABELS[key]) return ATTENDANCE_UI_LABELS[key]!;
  if (key in EMPLOYEE_CAPABILITY_DEFS) {
    return EMPLOYEE_CAPABILITY_DEFS[key as keyof typeof EMPLOYEE_CAPABILITY_DEFS].label;
  }
  if (key in ATTENDANCE_CAPABILITY_DEFS) {
    return ATTENDANCE_CAPABILITY_DEFS[key as keyof typeof ATTENDANCE_CAPABILITY_DEFS].label;
  }
  if (key in SCHEDULE_CAPABILITY_DEFS) {
    return SCHEDULE_CAPABILITY_DEFS[key as keyof typeof SCHEDULE_CAPABILITY_DEFS].label;
  }
  if (PAYSLIP_LABELS[key]) return PAYSLIP_LABELS[key];
  if (HR_POLICY_LABELS[key]) return HR_POLICY_LABELS[key];
  if (DOCUMENT_LABELS[key]) return DOCUMENT_LABELS[key];
  if (MASTER_DATA_LABELS[key]) return MASTER_DATA_LABELS[key];
  if (key.startsWith("web:")) {
    return `Akses halaman ${key.slice(4)}`;
  }
  return key.replace(/\./g, " / ").replace(/_/g, " ");
}

function groupHrBusinessCapabilities(keys: PermissionKey[]): CapabilityUiGroup[] {
  const businessKeys = keys.filter((k) => !isTechnicalWebPermissionKey(k));
  const groups: CapabilityUiGroup[] = [];
  const pick = (id: string, label: string, prefix: string | RegExp) => {
    const options = businessKeys
      .filter((k) => (typeof prefix === "string" ? k.startsWith(prefix) : prefix.test(k)))
      .map((k) => ({ key: k, label: labelForKey(k) }));
    if (options.length) groups.push({ id, label, options });
  };

  pick("employee", "Karyawan", "employee.");
  pick("attendance", "Kehadiran", "attendance.");
  pick("schedule", "Jadwal Kerja", "schedule.");
  pick("payslip", "Slip Gaji", "payslip.");
  pick("policy", "Kebijakan HR", "hr_policy.");
  pick("documents", "Dokumen Karyawan", "employee_document.");
  pick("master", "Data Master / Entitas", "master_data.");

  const grouped = new Set(groups.flatMap((g) => g.options.map((o) => o.key)));
  const rest = businessKeys
    .filter((k) => !grouped.has(k))
    .map((k) => ({ key: k, label: labelForKey(k) }));
  if (rest.length) groups.push({ id: "other", label: "Lainnya", options: rest });

  return groups;
}

function groupWebCapabilities(keys: PermissionKey[]): CapabilityUiGroup[] {
  const webKeys = keys.filter((k) => k.startsWith("web:"));
  return [
    {
      id: "routes",
      label: "Akses Halaman",
      options: webKeys.map((k) => ({ key: k, label: labelForKey(k) })),
    },
  ];
}

/** CUSTOM-mode picker catalog (excludes Owner-only keys; HR hides technical web: paths). */
export function buildModuleUiCatalog(moduleId: ModuleId): ModuleUiCatalog {
  const def = MODULE_REGISTRY[moduleId];
  const keys = listModulePermissionCatalog(moduleId).filter((k) => !isOwnerOnlyModuleCapability(k));

  const groups = moduleId === "hr" ? groupHrBusinessCapabilities(keys) : groupWebCapabilities(keys);

  return { id: moduleId, label: def.label, groups };
}

export function listAllModuleUiCatalogs(): ModuleUiCatalog[] {
  return (Object.keys(MODULE_REGISTRY) as ModuleId[]).map(buildModuleUiCatalog);
}
