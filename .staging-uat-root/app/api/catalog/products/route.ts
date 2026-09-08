import { NextResponse } from "next/server";
import { jsonError } from "@/lib/inventory/api-auth";
import { requireCatalogAccess } from "@/lib/catalog/api-auth";
import { createCatalogProductRecord, listCatalogProducts } from "@/lib/catalog/api-server";

export async function GET(req: Request) {
  try {
    const auth = await requireCatalogAccess(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const lifecycle = url.searchParams.get("lifecycle") ?? "all";
    const page = Number(url.searchParams.get("page") ?? 1);
    const perPage = Number(url.searchParams.get("perPage") ?? 50);
    const sellableOnly = url.searchParams.get("sellableOnly") === "1";
    const productType = url.searchParams.get("productType") as "simple" | "bundle" | null;

    const result = await listCatalogProducts(auth.user, {
      q,
      lifecycle,
      page,
      perPage,
      sellableOnly,
      productType: productType === "simple" || productType === "bundle" ? productType : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return jsonError(err, "Gagal memuat katalog produk.");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireCatalogAccess(req);
    const formData = await req.formData();
    const item = await createCatalogProductRecord(auth.user, formData);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return jsonError(err, "Gagal membuat produk.");
  }
}
