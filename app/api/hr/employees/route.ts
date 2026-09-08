import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientEmployeeMutationForgeryFields,
  requireAuthenticatedHrUser,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import { assertEmployeeCapability } from "@/lib/hr/employee-auth";
import { serverCreateEmployeeByHr } from "@/lib/hr/employee-onboarding-server";
import { serverListEmployeesForHr } from "@/lib/hr/employee-list-server";

/** GET /api/hr/employees — entity-scoped employee list (admin PB; not client profiles.listRule).
 * Query: companyId=all|<id> — Owner-only filter; ignored for non-Owner.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const url = new URL(req.url);
    const companyId = url.searchParams.get("companyId");
    const adminPb = await getInventoryAdminPb();
    const result = await serverListEmployeesForHr(adminPb, ctx, {
      companyId: companyId,
    });
    return NextResponse.json({
      ok: true,
      items: result.items,
      scope: result.scope,
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/employees — HR/Owner membuat karyawan baru (status nonaktif + profil lengkap). */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    assertEmployeeCapability(ctx, "employee.create");
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientEmployeeMutationForgeryFields(body, { allowPassword: true });

    const adminPb = await getInventoryAdminPb();
    const result = await serverCreateEmployeeByHr(adminPb, ctx, {
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      role_preset_id: String(body.role_preset_id ?? "staff"),
      dashboard_access:
        typeof body.dashboard_access === "boolean" ? body.dashboard_access : undefined,
      office_id: String(body.office_id ?? ""),
      position: body.position != null ? String(body.position) : undefined,
      department: body.department != null ? String(body.department) : undefined,
      division: body.division != null ? String(body.division) : undefined,
      salary_digits: body.salary_digits != null ? String(body.salary_digits) : undefined,
      phone: body.phone != null ? String(body.phone) : undefined,
      address: body.address != null ? String(body.address) : undefined,
      nik: body.nik != null ? String(body.nik) : undefined,
      npwp: body.npwp != null ? String(body.npwp) : undefined,
      employee_code: body.employee_code != null ? String(body.employee_code) : undefined,
      join_date: body.join_date != null ? String(body.join_date) : undefined,
      leave_bookings_quota:
        body.leave_bookings_quota != null ? String(body.leave_bookings_quota) : undefined,
      leave_daily_rate: body.leave_daily_rate != null ? String(body.leave_daily_rate) : undefined,
      extra_bonus_amount: body.extra_bonus_amount != null ? String(body.extra_bonus_amount) : undefined,
      extra_bonus_enabled:
        typeof body.extra_bonus_enabled === "boolean" ? body.extra_bonus_enabled : undefined,
      late_deduction_per_minute:
        body.late_deduction_per_minute != null ? String(body.late_deduction_per_minute) : undefined,
      absence_deduction_per_day:
        body.absence_deduction_per_day != null ? String(body.absence_deduction_per_day) : undefined,
      late_tolerance: body.late_tolerance != null ? String(body.late_tolerance) : undefined,
      shift_start: body.shift_start != null ? String(body.shift_start) : undefined,
      shift_end: body.shift_end != null ? String(body.shift_end) : undefined,
      shift_start_saturday:
        body.shift_start_saturday != null ? String(body.shift_start_saturday) : undefined,
      shift_end_saturday:
        body.shift_end_saturday != null ? String(body.shift_end_saturday) : undefined,
      shift_start_sunday:
        body.shift_start_sunday != null ? String(body.shift_start_sunday) : undefined,
      shift_end_sunday: body.shift_end_sunday != null ? String(body.shift_end_sunday) : undefined,
      require_checkin_selfie:
        typeof body.require_checkin_selfie === "boolean" ? body.require_checkin_selfie : undefined,
      org_position_id: String(body.org_position_id ?? body.orgPositionId ?? ""),
      primary_entity_id:
        body.primary_entity_id != null ? String(body.primary_entity_id) : undefined,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return hrJsonError(err);
  }
}
