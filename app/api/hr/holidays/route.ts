import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { listManageableHolidays, upsertHoliday } from "@/lib/hr/holiday-server";

/** GET /api/hr/holidays — HR/Owner list holidays. */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const items = await listManageableHolidays(adminPb, ctx);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/hr/holidays — create holiday + notify staff. */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const data = await upsertHoliday(adminPb, ctx, {
      date: String(body.date ?? ""),
      name: String(body.name ?? ""),
      holiday_type: body.holiday_type != null ? String(body.holiday_type) : undefined,
      description: body.description != null ? String(body.description) : undefined,
      company_id: body.company_id != null ? String(body.company_id) : undefined,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
