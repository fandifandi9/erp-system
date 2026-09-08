import { NextResponse } from "next/server";
import { canManageModuleAssignments } from "@/lib/access/can-manage-module-assignments";
import {
  previewAssignmentCapabilities,
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

/** POST — preview effective access for unsaved assignment form. */
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
    };

    if (!input.userId.trim()) {
      return NextResponse.json({ ok: false, error: "Pengguna wajib dipilih." }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();
    const preview = await previewAssignmentCapabilities(adminPb, {
      userId: input.userId,
      moduleId: input.moduleId,
      accessMode: input.accessMode,
      entityScopeMode: input.entityScopeMode,
      deskEnabled: input.deskEnabled,
      isActive: input.isActive,
      customPermissions: input.customPermissions ?? [],
      entityCompanyIds: input.entityCompanyIds ?? [],
    });

    return NextResponse.json({ ok: true, data: preview });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Gagal pratinjau." },
      { status: 400 },
    );
  }
}
