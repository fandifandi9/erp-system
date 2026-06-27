import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { POS_COLLECTIONS, type PosRegister } from "@/lib/pos/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; status?: number };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Collection biz_pos_registers belum dibuat di PocketBase. Ikuti POCKETBASE_POS_SETUP.md §1.";
  }
  if (err.status === 403 || /403|forbidden/i.test(raw)) {
    return "Akses ditolak PocketBase. Perbaiki API rules collection biz_pos_registers.";
  }
  return raw;
}

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") !== "0";
    const adminPb = await getInventoryAdminPb();
    const items = await adminPb.collection(POS_COLLECTIONS.registers).getFullList<PosRegister>({
      sort: "name",
      filter: activeOnly ? "is_active = true" : undefined,
      requestKey: null,
    });
    return NextResponse.json(items);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat terminal POS") }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const body = (await req.json()) as Partial<PosRegister>;
    if (!body.code?.trim() || !body.name?.trim()) {
      return NextResponse.json({ error: "Kode dan nama terminal wajib diisi" }, { status: 400 });
    }
    const row = await adminPb.collection(POS_COLLECTIONS.registers).create<PosRegister>({
      code: body.code.trim(),
      name: body.name.trim(),
      address: body.address?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      is_active: body.is_active ?? true,
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal menyimpan terminal POS") }, { status });
  }
}
