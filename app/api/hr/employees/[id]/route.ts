import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  hrJsonError,
  rejectClientEmployeeMutationForgeryFields,
  requireOwnerOrHrApiUser,
} from "@/lib/hr/api-auth";
import { serverUpdateEmployeeByHr } from "@/lib/hr/employee-mutation-server";
import { serverGetEmployeeDetailForHr } from "@/lib/hr/employee-detail-server";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/hr/employees/[id] — entity-scoped employee detail for HR edit page. */
export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id: userId } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const data = await serverGetEmployeeDetailForHr(adminPb, authCtx, userId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** PATCH /api/hr/employees/[id] — server-authoritative profile update. */
export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const authCtx = await requireOwnerOrHrApiUser(req);
    const { id: userId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientEmployeeMutationForgeryFields(body);

    const adminPb = await getInventoryAdminPb();
    const result = await serverUpdateEmployeeByHr(adminPb, authCtx, userId, {
      name: String(body.name ?? ""),
      email: String(body.email ?? ""),
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
      manager_user_id:
        body.manager_user_id === null
          ? null
          : body.manager_user_id != null
            ? String(body.manager_user_id)
            : undefined,
      org_position_id:
        body.org_position_id === null
          ? null
          : body.org_position_id != null
            ? String(body.org_position_id)
            : undefined,
      primary_entity_id:
        body.primary_entity_id != null ? String(body.primary_entity_id) : undefined,
      role_preset_id: body.role_preset_id != null ? String(body.role_preset_id) : undefined,
      dashboard_access:
        typeof body.dashboard_access === "boolean" ? body.dashboard_access : undefined,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return hrJsonError(err);
  }
}
