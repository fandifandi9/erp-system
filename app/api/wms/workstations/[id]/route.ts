import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { canAccess } from "@/lib/rbac";
import {
  buildWorkstationQrPayload,
  isValidWorkstationCode,
  normalizeWorkstationCode,
} from "@/lib/wms/workstation-qr";
import { workstationFromRow } from "@/lib/wms/workstations";

async function requireWmsUser(req: Request) {
  const auth = await getApiAuthUser(req);
  if (!auth) return { error: NextResponse.json({ error: "Login diperlukan" }, { status: 401 }) };
  const ok = canAccess(auth.user, "/wms") || canAccess(auth.user, "/gudang");
  if (!ok) return { error: NextResponse.json({ error: "Akses ditolak" }, { status: 403 }) };
  return { auth };
}

type Body = {
  code?: string;
  name?: string;
  location?: string;
  cctv?: string;
  is_active?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireWmsUser(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const { id } = await ctx.params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, error: "id wajib" }, { status: 400 });
    }
    const body = (await req.json()) as Body;
    const patch: Record<string, unknown> = {};

    if (body.code !== undefined) {
      const code = normalizeWorkstationCode(body.code);
      if (!isValidWorkstationCode(code)) {
        return NextResponse.json({ ok: false, error: "Kode meja tidak valid." }, { status: 400 });
      }
      patch.code = code;
      patch.qr_payload = buildWorkstationQrPayload(code);
    }
    if (body.name !== undefined) patch.name = body.name.trim() || undefined;
    if (body.location !== undefined) patch.location = body.location.trim() || undefined;
    if (body.cctv !== undefined) patch.cctv = body.cctv.trim() || undefined;
    if (body.is_active !== undefined) patch.is_active = body.is_active;

    const adminPb = await getInventoryAdminPb();
    if (patch.code) {
      const code = String(patch.code);
      const dup = await adminPb.collection("wms_workstations").getList(1, 1, {
        filter: `code = "${code.replace(/"/g, '\\"')}" && id != "${id}"`,
        requestKey: null,
      });
      if (dup.items.length > 0) {
        return NextResponse.json(
          { ok: false, error: `Kode meja ${code} sudah dipakai.` },
          { status: 409 },
        );
      }
    }

    const row = await adminPb.collection("wms_workstations").update(id, patch);
    return NextResponse.json({
      ok: true,
      desk: workstationFromRow(row as unknown as Record<string, unknown>),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal memperbarui meja.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
