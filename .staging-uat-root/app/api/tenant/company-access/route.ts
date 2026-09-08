import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { listAccessibleCompanies } from "@/lib/tenant/company-access";

/** Entitas yang boleh diakses user yang sedang login. */
export async function GET() {
  try {
    const ctx = await getApiAuthUser();
    if (!ctx) return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });

    const adminPb = await getInventoryAdminPb();
    const companies = await listAccessibleCompanies(adminPb, ctx.userId, ctx.user);

    return NextResponse.json({
      companyIds: companies.map((c) => c.id),
      companies,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memuat akses entitas" },
      { status: 500 },
    );
  }
}
