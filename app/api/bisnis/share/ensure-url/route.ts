import { NextResponse } from "next/server";
import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { canAccess } from "@/lib/rbac";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  docSharePublicUrlWithToken,
  ensureDocShareToken,
} from "@/lib/bisnis/doc-share-token";
import type { DocShareKind } from "@/lib/bisnis/doc-share";
import { bisnisApiError } from "@/lib/bisnis/api-auth";

type Body = {
  kind?: DocShareKind;
  id?: string;
};

const VALID_KINDS: DocShareKind[] = ["invoice", "sales_order", "quotation", "purchase_order"];

/** Pastikan share_token ada dan kembalikan URL publik aman (?token=). */
export async function POST(req: Request) {
  try {
    const ctx = await getApiAuthUser(req);
    if (!ctx) {
      return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    }
    const body = (await req.json()) as Body;
    const kind = body.kind;
    const id = body.id?.trim();
    if (!kind || !VALID_KINDS.includes(kind) || !id) {
      return NextResponse.json({ error: "kind dan id wajib" }, { status: 400 });
    }

    const pathByKind: Record<DocShareKind, string> = {
      invoice: "/bisnis/penjualan",
      sales_order: "/bisnis/penjualan",
      quotation: "/bisnis/penjualan",
      purchase_order: "/bisnis/pembelian",
    };
    if (!canAccess(ctx.user, pathByKind[kind])) {
      throw bisnisApiError("Akses share dokumen ditolak.", 403);
    }

    const adminPb = await getInventoryAdminPb();
    const token = await ensureDocShareToken(kind, id, adminPb);
    const origin = new URL(req.url).origin;
    const url = docSharePublicUrlWithToken(kind, id, token, origin);

    return NextResponse.json({ ok: true, token, url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Gagal";
    const status =
      e && typeof e === "object" && "status" in e && typeof e.status === "number"
        ? e.status
        : /unauthorized|forbidden|akses|login/i.test(msg)
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
