import { NextResponse } from "next/server";
import { requirePenjualanApiUser, bisnisApiError } from "@/lib/bisnis/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  importAwbZipToBatch,
  loadBatchAwbMatchRows,
  summarizeAwbBatchRows,
} from "@/lib/bisnis/awb-zip-import";

function pbErrorMessage(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return e instanceof Error ? e.message : err.message ?? fallback;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const adminPb = await getInventoryAdminPb();
    const rows = await loadBatchAwbMatchRows(adminPb, id);
    return NextResponse.json({
      ok: true,
      rows,
      summary: summarizeAwbBatchRows(rows),
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Gagal memuat status AWB batch") }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePenjualanApiUser(req);
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw bisnisApiError("File ZIP wajib diunggah.", 400);
    }
    if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") {
      throw bisnisApiError("Format harus file ZIP.", 400);
    }
    if (file.size > 64 * 1024 * 1024) {
      throw bisnisApiError("Ukuran ZIP maksimal 64 MB.", 400);
    }

    const adminPb = await getInventoryAdminPb();
    const buf = await file.arrayBuffer();
    const result = await importAwbZipToBatch(adminPb, id, buf);
    const rows = await loadBatchAwbMatchRows(adminPb, id);

    return NextResponse.json({
      ok: true,
      result,
      summary: summarizeAwbBatchRows(rows),
    });
  } catch (e: unknown) {
    const err = e as { status?: number };
    const status = typeof err.status === "number" ? err.status : 500;
    return NextResponse.json({ error: pbErrorMessage(e, "Import ZIP AWB gagal") }, { status });
  }
}
