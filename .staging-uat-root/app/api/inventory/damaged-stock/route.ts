import { NextResponse } from "next/server";
import { jsonError, requireInventoryAccess } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import {
  damagedStockRowKey,
  listDamagedWarehouseStock,
  listDamagedWarehouses,
  listRetailWarehousesByCompany,
} from "@/lib/inventory/damaged-disposition";
import { loadDamagedIntakeRefs, type DamagedIntakeRef } from "@/lib/inventory/damaged-intake-refs";

export async function GET(req: Request) {
  try {
    await requireInventoryAccess(req);
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company")?.trim() || undefined;
    const warehouseId = url.searchParams.get("warehouse")?.trim() || undefined;

    const pb = await getInventoryAdminPb();
    const [warehouses, items, retailByCompany] = await Promise.all([
      listDamagedWarehouses(pb),
      listDamagedWarehouseStock(pb, { companyId, warehouseId }),
      listRetailWarehousesByCompany(pb),
    ]);

    const whIds = [...new Set(items.map((i) => i.warehouseId))];
    const productIds = [...new Set(items.map((i) => i.productId))];
    const intakeMap = await loadDamagedIntakeRefs(pb, whIds, productIds);

    const intakeRefs: Record<string, DamagedIntakeRef[]> = {};
    for (const item of items) {
      const key = damagedStockRowKey(item.warehouseId, item.productId);
      intakeRefs[key] = intakeMap[key] ?? [];
    }

    return NextResponse.json({
      ok: true,
      warehouses,
      items,
      intakeRefs,
      retailByCompany,
    });
  } catch (err) {
    return jsonError(err, "Gagal memuat stok gudang rusak.");
  }
}
