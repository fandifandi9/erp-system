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

/** Buat meja validator baru (+ QR payload). */
export async function POST(req: Request) {
  const gate = await requireWmsUser(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const body = (await req.json()) as Body;
    const code = normalizeWorkstationCode(body.code ?? "");
    if (!isValidWorkstationCode(code)) {
      return NextResponse.json(
        { ok: false, error: "Kode meja tidak valid (contoh: VALIDATOR-01 atau PACK-A)." },
        { status: 400 },
      );
    }
    const name = (body.name ?? "").trim() || `Meja ${code}`;
    const location = (body.location ?? "").trim() || "Gudang — zona packing";
    const cctv = (body.cctv ?? "").trim() || "—";
    const qr_payload = buildWorkstationQrPayload(code);

    const adminPb = await getInventoryAdminPb();
    const existing = await adminPb.collection("wms_workstations").getList(1, 1, {
      filter: `code = "${code.replace(/"/g, '\\"')}"`,
      requestKey: null,
    });
    if (existing.items.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Kode meja ${code} sudah ada.` },
        { status: 409 },
      );
    }

    const row = await adminPb.collection("wms_workstations").create({
      code,
      name,
      location,
      cctv,
      qr_payload,
      is_active: body.is_active !== false,
    });

    return NextResponse.json({
      ok: true,
      desk: workstationFromRow(row as unknown as Record<string, unknown>),
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const missing =
      /wasn't found|404|Missing collection|unknown collection/i.test(raw);
    const message = missing
      ? "Koleksi PocketBase wms_workstations belum ada. Jalankan: node scripts/fix-pb-wms-workstation-sessions-schema.mjs lalu coba lagi."
      : raw || "Gagal membuat meja.";
    return NextResponse.json({ ok: false, error: message }, { status: missing ? 503 : 500 });
  }
}
