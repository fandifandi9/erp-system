import { NextResponse } from "next/server";
import { canManageModuleAssignments } from "@/lib/access/can-manage-module-assignments";
import { listAllModuleUiCatalogs } from "@/lib/access/capability-ui-catalog";
import {
  createModuleAssignmentAdmin,
  listAllModuleAssignmentsAdmin,
  listUsersForModuleAssignmentAdmin,
  type ModuleAssignmentWriteInput,
} from "@/lib/access/module-assignment-admin-server";
import { isKnownModuleId } from "@/lib/access/module-registry";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

async function requireOwnerModuleAdmin(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx) return { error: NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 }) };
  if (!canManageModuleAssignments(ctx.user)) {
    return { error: NextResponse.json({ ok: false, error: "Hanya Owner yang dapat mengelola akses modul." }, { status: 403 }) };
  }
  return { ctx };
}

function formatModuleAdminError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Gagal memuat data.";
  if (/wasn't found|not found|404/i.test(msg)) {
    return "Koleksi akses modul belum tersedia. Jalankan: npm run migrate:local-hr-phase35i lalu refresh halaman.";
  }
  return msg;
}

/** GET — list assignments + catalog + users. POST — create assignment. */
export async function GET(req: Request) {
  const gate = await requireOwnerModuleAdmin(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const adminPb = await getInventoryAdminPb();
    const [items, users] = await Promise.all([
      listAllModuleAssignmentsAdmin(adminPb),
      listUsersForModuleAssignmentAdmin(adminPb),
    ]);
    return NextResponse.json({
      ok: true,
      items,
      users,
      catalog: listAllModuleUiCatalogs(),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: formatModuleAdminError(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const gate = await requireOwnerModuleAdmin(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const moduleId = String(body.moduleId ?? "");
    if (!isKnownModuleId(moduleId)) {
      return NextResponse.json({ ok: false, error: "Modul tidak valid." }, { status: 400 });
    }

    const input: ModuleAssignmentWriteInput = {
      userId: String(body.userId ?? ""),
      moduleId,
      accessMode: String(body.accessMode ?? "full").toLowerCase() === "custom" ? "custom" : "full",
      entityScopeMode: String(body.entityScopeMode ?? "selected").toLowerCase() === "all" ? "all" : "selected",
      deskEnabled: body.deskEnabled !== false,
      isActive: body.isActive !== false,
      customPermissions: Array.isArray(body.customPermissions)
        ? body.customPermissions.map(String)
        : [],
      entityCompanyIds: Array.isArray(body.entityCompanyIds)
        ? body.entityCompanyIds.map(String)
        : [],
      notes: body.notes != null ? String(body.notes) : undefined,
    };

    const adminPb = await getInventoryAdminPb();
    const id = await createModuleAssignmentAdmin(adminPb, gate.ctx!.userId, input);
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
