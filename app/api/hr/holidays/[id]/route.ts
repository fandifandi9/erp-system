import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, rejectClientPrivilegeFields, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import { upsertHoliday } from "@/lib/hr/holiday-server";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/hr/holidays/[id] — update or deactivate holiday. */
export async function PATCH(req: Request, context: Ctx) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    rejectClientPrivilegeFields(body);
    const adminPb = await getInventoryAdminPb();
    const existing = (await adminPb.collection("office_holidays").getOne(id, {
      requestKey: null,
    })) as Record<string, unknown>;
    const data = await upsertHoliday(adminPb, ctx, {
      id,
      date: body.date != null ? String(body.date) : String(existing.date ?? ""),
      name: body.name != null ? String(body.name) : String(existing.name ?? ""),
      holiday_type:
        body.holiday_type != null ? String(body.holiday_type) : String(existing.holiday_type ?? "company"),
      description:
        body.description != null ? String(body.description) : String(existing.description ?? ""),
      company_id:
        body.company_id != null ? String(body.company_id) : String(existing.company_id ?? ""),
      is_active: body.is_active !== false,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** DELETE /api/hr/holidays/[id] — soft-delete (deactivate) holiday. */
export async function DELETE(req: Request, context: Ctx) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const existing = (await adminPb.collection("office_holidays").getOne(id, {
      requestKey: null,
    })) as Record<string, unknown>;
    const data = await upsertHoliday(adminPb, ctx, {
      id,
      date: String(existing.date ?? ""),
      name: String(existing.name ?? ""),
      holiday_type: String(existing.holiday_type ?? "company"),
      description: String(existing.description ?? ""),
      company_id: String(existing.company_id ?? ""),
      is_active: false,
    });
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}
