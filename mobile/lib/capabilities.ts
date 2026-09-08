/**
 * mobile/lib/capabilities.ts
 * Phase 24A — Mobile RBAC Capability Foundation
 *
 * Single source of truth for what actions a user may perform in the mobile app.
 *
 * Architecture:
 *   ACCOUNT → ROLE/PERMISSIONS → CAPABILITY → MODULE/ACTION
 *
 * SECURITY CONTRACT:
 *   - This file governs UI visibility and navigation only.
 *   - Server-side API authorization is NEVER derived from capabilities.
 *   - Capabilities absent → button/screen hidden. Capabilities present ≠ server permit.
 *   - resolveMobileCapabilities() is FAIL CLOSED: null/unknown user → empty set.
 *
 * BACKWARD COMPATIBILITY:
 *   - All existing mobile functions (canAccess, isHrOrOwnerAccount, etc.) are unchanged.
 *   - Capability layer is additive. Existing navigation guards remain in place.
 *   - Future: existing hard-coded role checks can be migrated here incrementally.
 */

import { normalizeAuthModel } from "@/lib/rbac";
import { canAccessInventory, readInventoryRole } from "@/lib/inventory/access";

// ─── Capability string registry ───────────────────────────────────────────────
// Naming convention: <domain>.<action>
// STATUS tags in CapabilityMeta:
//   ACTIVE        = implemented in current mobile source
//   FUTURE        = capability defined, no screen/implementation yet
//   TECH_DEBT     = implemented via hard-coded role check (not capability-driven)

export const MOBILE_CAPABILITIES = [
  // ── Attendance ────────────────────────────────────────────────────────────
  "attendance.view",         // View attendance tab & history
  "attendance.check_in",     // Submit check-in
  "attendance.check_out",    // Submit check-out

  // ── Leave ─────────────────────────────────────────────────────────────────
  "leave.view_own",          // View own leave requests
  "leave.create",            // Submit new leave request
  "leave.cancel_own",        // Cancel own pending leave
  "leave.approve",           // HR/Owner: approve or reject leave requests

  // ── Overtime ──────────────────────────────────────────────────────────────
  "overtime.view_own",       // View own overtime submissions
  "overtime.create",         // Submit overtime request
  "overtime.approve",        // HR/Owner: approve or reject overtime

  // ── Field Activity ────────────────────────────────────────────────────────
  "field_activity.view_own", // View own field activity submissions
  "field_activity.create",   // Submit field activity request
  "field_activity.approve",  // HR/Owner: approve or reject field activity

  // ── Staff Reports (hr_staff_reports) ─────────────────────────────────────
  "report.view_own",         // View own submitted reports
  "report.create",           // Create a new staff report
  "report.view_all",         // HR/Owner: view all staff reports
  "report.review",           // HR/Owner: review and comment on reports
  "report.close",            // HR/Owner: close/resolve a report

  // ── Findings (hr_findings) ────────────────────────────────────────────────
  "finding.view",            // HR/Owner: view HR findings list
  "finding.create",          // HR/Owner: record a new finding
  "finding.manage",          // HR/Owner: edit, close, or delete findings

  // ── Rating ────────────────────────────────────────────────────────────────
  "rating.task_view",        // View own assigned rating tasks
  "rating.task_submit",      // Submit rating evaluation (if assigned)
  "rating.result_view_own",  // View own rating result
  "rating.manage",           // HR/Owner: create periods and manage assignments

  // ── HR Admin Queues ───────────────────────────────────────────────────────
  "hr.queue.leave",          // HR/Owner: leave approval queue
  "hr.queue.overtime",       // HR/Owner: overtime approval queue
  "hr.queue.field_activity", // HR/Owner: field activity approval queue
  "hr.staff.view",           // HR/Owner: view staff list in HR native module

  // ── Inventory / Warehouse ─────────────────────────────────────────────────
  // Requires inventory_role field on users (separate from role_code)
  "inventory.view",          // View warehouse/inventory hub screen
  "inventory.zone_scan",     // Scan zone QR code
  "inventory.product_scan",  // Scan product barcode for stock check
  "inventory.packing",       // Access packing checklist
  "inventory.opname",        // FUTURE: stock opname (supervisor+)
  "inventory.movement_create", // Create stock movement draft
  "wms.workstation_scan",    // Scan WMS validator workstation QR

  // ── Payroll ───────────────────────────────────────────────────────────────
  "payroll.view_own",        // View own payslip

  // ── Profile ───────────────────────────────────────────────────────────────
  "profile.view_own",        // View own profile screen
  "profile.edit_own",        // Edit own profile info

  // ── Employee / team (Phase 31) ────────────────────────────────────────────
  "employee.view_team",      // Manager/HR: view managed team scope

  "schedule.view",           // View own / team work schedule (Phase 33B)

  // ── Dashboard / Meja Kerja ────────────────────────────────────────────────
  "dashboard.work",          // Show Meja Kerja tab (all authenticated users)
  "dashboard.operational",   // Show operational work sections (dashboard_access or HR/Owner)
] as const;

export type MobileCapability = (typeof MOBILE_CAPABILITIES)[number];

// ─── Capability metadata ──────────────────────────────────────────────────────

export type CapabilityStatus = "ACTIVE" | "FUTURE" | "TECH_DEBT";

export type CapabilityMeta = {
  /** Human-readable label (Indonesian) */
  label: string;
  /** Current implementation status */
  status: CapabilityStatus;
  /** Mobile screen route, or null if not implemented yet */
  screen: string | null;
  /** Notification recipient eligibility for Phase 24B */
  notificationEligible: boolean;
};

export const MOBILE_CAPABILITY_DEFS: Record<MobileCapability, CapabilityMeta> = {
  // Attendance
  "attendance.view":          { label: "Lihat absensi",          status: "ACTIVE",    screen: "/(tabs)/attendance",    notificationEligible: false },
  "attendance.check_in":      { label: "Absen masuk",            status: "ACTIVE",    screen: "/(tabs)/attendance",    notificationEligible: false },
  "attendance.check_out":     { label: "Absen pulang",           status: "ACTIVE",    screen: "/(tabs)/attendance",    notificationEligible: false },
  // Leave
  "leave.view_own":           { label: "Lihat cuti sendiri",     status: "ACTIVE",    screen: "/(tabs)/leave",         notificationEligible: false },
  "leave.create":             { label: "Ajukan cuti",            status: "ACTIVE",    screen: "/(tabs)/leave",         notificationEligible: false },
  "leave.cancel_own":         { label: "Batalkan cuti sendiri",  status: "ACTIVE",    screen: "/(tabs)/leave",         notificationEligible: false },
  "leave.approve":            { label: "Setujui/tolak cuti",     status: "ACTIVE",    screen: "/hr/leave-queue",       notificationEligible: true  },
  // Overtime
  "overtime.view_own":        { label: "Lihat lembur sendiri",   status: "ACTIVE",    screen: "/(tabs)/overtime",      notificationEligible: false },
  "overtime.create":          { label: "Ajukan lembur",          status: "ACTIVE",    screen: "/(tabs)/overtime",      notificationEligible: false },
  "overtime.approve":         { label: "Setujui/tolak lembur",   status: "ACTIVE",    screen: "/hr/overtime-queue",    notificationEligible: true  },
  // Field Activity
  "field_activity.view_own":  { label: "Lihat luar kantor",      status: "ACTIVE",    screen: "/(tabs)/field",         notificationEligible: false },
  "field_activity.create":    { label: "Ajukan luar kantor",     status: "ACTIVE",    screen: "/(tabs)/field",         notificationEligible: false },
  "field_activity.approve":   { label: "Setujui luar kantor",    status: "ACTIVE",    screen: "/hr/field-queue",       notificationEligible: true  },
  // Reports
  "report.view_own":          { label: "Lihat laporan sendiri",  status: "ACTIVE",    screen: "/reports",              notificationEligible: false },
  "report.create":            { label: "Buat laporan",           status: "ACTIVE",    screen: "/reports/new",          notificationEligible: false },
  "report.view_all":          { label: "Lihat semua laporan",    status: "ACTIVE",    screen: "/reports",              notificationEligible: true  },
  "report.review":            { label: "Tinjau laporan staf",    status: "ACTIVE",    screen: "/reports",              notificationEligible: true  },
  "report.close":             { label: "Tutup laporan",          status: "ACTIVE",    screen: "/reports",              notificationEligible: true  },
  // Findings
  "finding.view":             { label: "Lihat temuan HR",        status: "ACTIVE",    screen: "/findings",             notificationEligible: true  },
  "finding.create":           { label: "Catat temuan HR",        status: "ACTIVE",    screen: "/findings/new",         notificationEligible: true  },
  "finding.manage":           { label: "Kelola temuan HR",       status: "ACTIVE",    screen: "/findings",             notificationEligible: true  },
  // Rating
  "rating.task_view":         { label: "Lihat tugas penilaian",  status: "ACTIVE",    screen: "/(tabs)/rating",        notificationEligible: false },
  "rating.task_submit":       { label: "Submit penilaian",       status: "ACTIVE",    screen: "/(tabs)/rating",        notificationEligible: false },
  "rating.result_view_own":   { label: "Lihat hasil rating",     status: "ACTIVE",    screen: "/(tabs)/rating",        notificationEligible: false },
  "rating.manage":            { label: "Kelola periode rating",  status: "ACTIVE",    screen: "/(tabs)/rating",        notificationEligible: true  },
  // HR Queues
  "hr.queue.leave":           { label: "Antrean cuti HR",        status: "ACTIVE",    screen: "/hr/leave-queue",       notificationEligible: true  },
  "hr.queue.overtime":        { label: "Antrean lembur HR",      status: "ACTIVE",    screen: "/hr/overtime-queue",    notificationEligible: true  },
  "hr.queue.field_activity":  { label: "Antrean luar kantor HR", status: "ACTIVE",    screen: "/hr/field-queue",       notificationEligible: true  },
  "hr.staff.view":            { label: "Lihat daftar staf",      status: "ACTIVE",    screen: "/hr",                   notificationEligible: false },
  // Inventory
  "inventory.view":           { label: "Hub gudang",             status: "ACTIVE",    screen: "/inventory",            notificationEligible: false },
  "inventory.zone_scan":      { label: "Scan zona QR",           status: "ACTIVE",    screen: "/inventory/zone-scan",  notificationEligible: false },
  "inventory.product_scan":   { label: "Scan produk/barcode",    status: "ACTIVE",    screen: "/inventory/product-scan", notificationEligible: false },
  "inventory.packing":        { label: "Checklist kemasan",      status: "ACTIVE",    screen: "/inventory/packing",    notificationEligible: false },
  "inventory.opname":         { label: "Opname stok",            status: "FUTURE",    screen: null,                    notificationEligible: false },
  "inventory.movement_create":{ label: "Buat mutasi stok",       status: "ACTIVE",    screen: "/inventory/movement-new", notificationEligible: false },
  "wms.workstation_scan":     { label: "Scan meja validasi WMS", status: "ACTIVE",    screen: "/wms/workstation-scan", notificationEligible: false },
  // Payroll
  "payroll.view_own":         { label: "Lihat slip gaji",        status: "ACTIVE",    screen: "/(tabs)/payroll",       notificationEligible: false },
  // Profile
  "profile.view_own":         { label: "Lihat profil",           status: "ACTIVE",    screen: "/(tabs)/profile",       notificationEligible: false },
  "profile.edit_own":         { label: "Edit profil",            status: "ACTIVE",    screen: "/(tabs)/profile",       notificationEligible: false },
  "employee.view_team":       { label: "Lihat tim",              status: "ACTIVE",    screen: "/hr",                   notificationEligible: false },
  "schedule.view":            { label: "Lihat jadwal kerja",     status: "ACTIVE",    screen: "/(tabs)/attendance",    notificationEligible: false },
  // Dashboard
  "dashboard.work":           { label: "Tab Meja Kerja",         status: "ACTIVE",    screen: "/(tabs)/kerja",         notificationEligible: false },
  "dashboard.operational":    { label: "Seksi operasional kerja",status: "ACTIVE",    screen: "/(tabs)/kerja",         notificationEligible: false },
};

// ─── User shape ───────────────────────────────────────────────────────────────

type UserShape = Record<string, unknown> | null | undefined;

// ─── Capability resolver ──────────────────────────────────────────────────────

/**
 * Resolve the full set of capabilities for a given authenticated user context.
 *
 * FAIL CLOSED: null/undefined/malformed user → empty Set (zero capabilities).
 *
 * This resolver does NOT replace server authorization. It determines what the
 * mobile UI shows or enables. The API server always enforces its own access checks.
 *
 * Resolution order:
 *   1. account_type (owner vs user) — primary axis
 *   2. role_code — secondary axis for user accounts
 *   3. dashboard_access — determines operational section visibility
 *   4. inventory_role — independent warehouse access dimension
 */
export function resolveMobileCapabilities(user: UserShape): Set<MobileCapability> {
  const caps = new Set<MobileCapability>();

  // Fail closed: unauthenticated or malformed context → zero capabilities
  if (!user || typeof user !== "object") return caps;

  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const roleCode = auth.roleCode; // null for owner
  const isHr = !isOwner && roleCode === "hr";
  const isManager = !isOwner && roleCode === "manager";
  const isHrOrOwner = isOwner || isHr;

  // ── Universal: all authenticated users ──────────────────────────────────
  caps.add("profile.view_own");
  caps.add("profile.edit_own");
  caps.add("dashboard.work");        // Meja Kerja tab visible to all logged-in users

  caps.add("attendance.view");
  caps.add("attendance.check_in");
  caps.add("attendance.check_out");
  caps.add("schedule.view");

  caps.add("leave.view_own");
  caps.add("leave.create");
  caps.add("leave.cancel_own");

  caps.add("overtime.view_own");
  caps.add("overtime.create");

  caps.add("field_activity.view_own");
  caps.add("field_activity.create");

  caps.add("payroll.view_own");

  // All authenticated users can create reports and view own reports
  caps.add("report.view_own");
  caps.add("report.create");

  // All authenticated users can participate in rating (as ratee or reviewer)
  caps.add("rating.task_view");
  caps.add("rating.task_submit");
  caps.add("rating.result_view_own");

  // ── Dashboard operational section ────────────────────────────────────────
  // Owner, HR, and users with dashboard_access flag see operational sections
  if (isHrOrOwner || auth.dashboardAccess) {
    caps.add("dashboard.operational");
  }

  // ── HR/Owner exclusive capabilities ──────────────────────────────────────
  if (isHrOrOwner) {
    // Leave management
    caps.add("leave.approve");
    caps.add("overtime.approve");
    caps.add("field_activity.approve");

    // HR report review
    caps.add("report.view_all");
    caps.add("report.review");
    caps.add("report.close");

    // Findings (HR-only native feature)
    caps.add("finding.view");
    caps.add("finding.create");
    caps.add("finding.manage");

    // Rating management
    caps.add("rating.manage");

    // HR native queues
    caps.add("hr.queue.leave");
    caps.add("hr.queue.overtime");
    caps.add("hr.queue.field_activity");
    caps.add("hr.staff.view");
  }

  // Manager / HR team visibility foundation (Phase 31)
  if (isOwner || isManager || isHr) {
    caps.add("employee.view_team");
  }

  // ── Inventory / Warehouse capabilities ───────────────────────────────────
  // Independent axis: requires inventory_role field (separate from role_code).
  // Owner always has full inventory access. Other users need an assigned inventory_role.
  if (canAccessInventory(user)) {
    caps.add("inventory.view");
    caps.add("inventory.zone_scan");
    caps.add("inventory.product_scan");
    caps.add("inventory.packing");
    caps.add("inventory.movement_create");
    caps.add("wms.workstation_scan");

    // Opname requires supervisor or higher inventory_role
    const invRole = readInventoryRole(user);
    if (isOwner || invRole === "supervisor" || invRole === "admin") {
      caps.add("inventory.opname");
    }
  }

  return caps;
}

/**
 * Check a single capability for a user.
 * This is the primary API for component-level capability checks.
 *
 * Usage:
 *   if (hasCapability(user, "leave.approve")) { ... }
 */
export function hasCapability(user: UserShape, cap: MobileCapability): boolean {
  return resolveMobileCapabilities(user).has(cap);
}

/**
 * Check if a user has ALL of the specified capabilities.
 */
export function hasAllCapabilities(user: UserShape, caps: MobileCapability[]): boolean {
  const resolved = resolveMobileCapabilities(user);
  return caps.every((c) => resolved.has(c));
}

/**
 * Check if a user has ANY of the specified capabilities.
 */
export function hasAnyCapability(user: UserShape, caps: MobileCapability[]): boolean {
  const resolved = resolveMobileCapabilities(user);
  return caps.some((c) => resolved.has(c));
}

/**
 * Return all capabilities as an array (for debugging/logging).
 * Never expose this in production UI or API responses.
 */
export function listCapabilities(user: UserShape): MobileCapability[] {
  return [...resolveMobileCapabilities(user)];
}
