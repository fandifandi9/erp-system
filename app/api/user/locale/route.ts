import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

export async function GET() {
  try {
    const ctx = await getApiAuthUser();
    if (!ctx) return NextResponse.json({ locale: "id" });
    const adminPb = await getInventoryAdminPb();
    const user = await adminPb.collection("users").getOne(ctx.userId);
    const locale = (user as { locale?: string }).locale;
    return NextResponse.json({ locale: locale === "en" ? "en" : "id" });
  } catch {
    return NextResponse.json({ locale: "id" });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
    const body = (await req.json()) as { locale?: string };
    const locale = body.locale === "en" ? "en" : "id";
    const adminPb = await getInventoryAdminPb();
    await adminPb.collection("users").update(ctx.userId, { locale });
    return NextResponse.json({ ok: true, locale });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan bahasa" },
      { status: 500 },
    );
  }
}
