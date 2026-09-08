import { NextResponse } from "next/server";
import { requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Courier } from "@/lib/bisnis/types";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string; status?: number };
  const raw = e instanceof Error ? e.message : err.message ?? fallback;
  if (/wasn't found|404|collection/i.test(raw)) {
    return "Collection biz_couriers belum dibuat di PocketBase. Ikuti POCKETBASE_POS_SETUP.md §11.";
  }
  if (err.status === 403 || /403|forbidden/i.test(raw)) {
    return "Akses ditolak PocketBase. Gunakan API server atau perbaiki rules collection biz_couriers.";
  }
  return raw;
}

export async function GET(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active") !== "0";
    const adminPb = await getInventoryAdminPb();
    const items = await adminPb.collection(BISNIS_COLLECTIONS.couriers).getFullList<Courier>({
      sort: "name",
      filter: activeOnly ? "is_active = true" : undefined,
      requestKey: null,
    });
    return NextResponse.json(items);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat ekspedisi") }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requirePenjualanApiUser(req);
    const adminPb = await getInventoryAdminPb();
    const contentType = req.headers.get("content-type") ?? "";

    let row: Courier;
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const name = String(fd.get("name") ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Nama ekspedisi wajib diisi" }, { status: 400 });
      }
      row = await adminPb.collection(BISNIS_COLLECTIONS.couriers).create<Courier>(fd);
    } else {
      const body = (await req.json()) as Partial<Courier>;
      if (!body.name?.trim()) {
        return NextResponse.json({ error: "Nama ekspedisi wajib diisi" }, { status: 400 });
      }
      row = await adminPb.collection(BISNIS_COLLECTIONS.couriers).create<Courier>({
        name: body.name.trim(),
        code: body.code?.trim() || undefined,
        notes: body.notes?.trim() || undefined,
        is_active: body.is_active ?? true,
      });
    }
    return NextResponse.json(row);
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal menyimpan ekspedisi") }, { status });
  }
}
