import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser, requireOwnerApiUser } from "@/lib/hr/api-auth";
import { fetchEntityLogoBytes, removeEntityLogo, uploadEntityLogo } from "@/lib/hr/entity-logo-server";
import { assertMasterDataCapability } from "@/lib/master-data/master-data-auth";
import { assertLegalEntityReadableByActor } from "@/lib/master-data/legal-entity";

type Ctx = { params: Promise<{ id: string }> };

/** GET — logo image for HR/Owner (proxied, scoped). */
export async function GET(req: Request, context: Ctx) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    assertMasterDataCapability(ctx, "master_data.entity.view");
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    await assertLegalEntityReadableByActor(adminPb, ctx, id);
    const file = await fetchEntityLogoBytes(adminPb, id);
    if (!file) {
      return NextResponse.json({ ok: false, error: "Logo tidak ditemukan." }, { status: 404 });
    }
    return new NextResponse(file.bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const ctx = await requireOwnerApiUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    const form = await req.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "File logo wajib." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const data = await uploadEntityLogo(adminPb, ctx, id, bytes, file.type, file.name);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return hrJsonError(err);
  }
}

export async function DELETE(req: Request, context: Ctx) {
  try {
    const ctx = await requireOwnerApiUser(req);
    const { id } = await context.params;
    const adminPb = await getInventoryAdminPb();
    await removeEntityLogo(adminPb, ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return hrJsonError(err);
  }
}
