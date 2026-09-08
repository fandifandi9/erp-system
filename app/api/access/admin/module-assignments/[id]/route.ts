import { NextResponse } from "next/server";
import { canManageModuleAssignments } from "@/lib/access/can-manage-module-assignments";
import {
  deleteModuleAssignmentAdmin,
  previewAssignmentCapabilities,
  updateModuleAssignmentAdmin,
  type ModuleAssignmentWriteInput,
} from "@/lib/access/module-assignment-admin-server";
import { isKnownModuleId, MODULE_REGISTRY } from "@/lib/access/module-registry";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

type Ctx = { params: Promise<{ id: string }> };

async function requireOwnerModuleAdmin(req?: Request) {
  const ctx = await getApiAuthUser(req);
  if (!ctx) return { error: NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 }) };
  if (!canManageModuleAssignments(ctx.user)) {
    return { error: NextResponse.json({ ok: false, error: "Hanya Owner yang dapat mengelola akses modul." }, { status: 403 }) };
  }
  return { ctx };
}

/** PATCH — update assignment. DELETE — remove assignment. GET ?preview=1 — effective access preview. */
export async function PATCH(req: Request, context: Ctx) {
  const gate = await requireOwnerModuleAdmin(req);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "ID wajib." }, { status: 400 });
  }

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
    await updateModuleAssignmentAdmin(adminPb, id, input);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request, context: Ctx) {
  const gate = await requireOwnerModuleAdmin(req);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "ID wajib." }, { status: 400 });
  }

  try {
    const adminPb = await getInventoryAdminPb();
    await deleteModuleAssignmentAdmin(adminPb, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Gagal menghapus." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, context: Ctx) {
  const gate = await requireOwnerModuleAdmin(req);
  if ("error" in gate && gate.error) return gate.error;

  const { id } = await context.params;
  const url = new URL(req.url);
  if (url.searchParams.get("preview") !== "1") {
    return NextResponse.json({ ok: false, error: "Gunakan preview=1" }, { status: 400 });
  }

  try {
    const adminPb = await getInventoryAdminPb();
    const row = await adminPb.collection("sys_user_module_assignments").getOne(id, {
      expand: "user",
      requestKey: null,
    });
    const moduleId = String((row as Record<string, unknown>).module_id ?? "");
    if (!isKnownModuleId(moduleId)) {
      return NextResponse.json({ ok: false, error: "Modul tidak valid." }, { status: 400 });
    }

    const preview = await previewAssignmentCapabilities(adminPb, {
      userId: String(row.user),
      moduleId,
      accessMode: String(row.access_mode ?? "full").toLowerCase() === "custom" ? "custom" : "full",
      entityScopeMode:
        String(row.entity_scope_mode ?? "selected").toLowerCase() === "all" ? "all" : "selected",
      deskEnabled: row.desk_enabled !== false,
      isActive: row.is_active !== false,
      customPermissions: [],
      entityCompanyIds: [],
    });

    return NextResponse.json({
      ok: true,
      data: {
        moduleLabel: MODULE_REGISTRY[moduleId].label,
        ...preview,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Gagal pratinjau." },
      { status: 500 },
    );
  }
}
