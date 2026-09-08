import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { InvStockBalance } from "@/lib/inventory/types";
import { cachedFetch, invalidateStockCache } from "@/lib/catalog/stock-cache";

function escId(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type StockListResult = {
  items: InvStockBalance[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
  draftCount: number;
};

export async function getWarehouseStockListServer(opts: {
  warehouseId: string;
  page?: number;
  perPage?: number;
  q?: string;
}): Promise<StockListResult> {
  const warehouseId = opts.warehouseId?.trim();
  if (!warehouseId) {
    return { items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 100, draftCount: 0 };
  }

  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(Math.max(opts.perPage ?? 100, 1), 200);
  const q = opts.q?.trim();

  const pb = await getInventoryAdminPb();
  const parts = [`warehouse = "${escId(warehouseId)}"`];
  if (q) {
    const esc = escId(q);
    parts.push(`(product.sku ~ "${esc}" || product.name ~ "${esc}" || product.barcode ~ "${esc}")`);
  }

  const [balanceRes, draftRes] = await Promise.all([
    pb.collection(INV_COLLECTIONS.balances).getList(page, perPage, {
      sort: "-updated",
      filter: parts.join(" && "),
      expand: "product",
      requestKey: null,
    }),
    pb.collection(INV_COLLECTIONS.movements).getList(1, 1, {
      filter: 'status = "draft"',
      fields: "id",
      requestKey: null,
    }),
  ]);

  return {
    items: balanceRes.items as unknown as InvStockBalance[],
    totalItems: balanceRes.totalItems,
    totalPages: balanceRes.totalPages,
    page: balanceRes.page,
    perPage: balanceRes.perPage,
    draftCount: draftRes.totalItems,
  };
}

export type WarehouseDirectoryRow = {
  id: string;
  code: string;
  name: string;
  address?: string;
  company?: string;
  store?: string;
  warehouse_role?: string;
  is_active?: boolean;
  is_primary?: boolean;
};

export type WarehouseDirectory = {
  warehouses: WarehouseDirectoryRow[];
  companies: { id: string; company_name?: string; code?: string }[];
  stores: { id: string; name?: string; code?: string; company?: string; is_active?: boolean }[];
};

export async function getWarehouseDirectoryServer(): Promise<WarehouseDirectory> {
  return cachedFetch(
    "inventory:warehouse-directory",
    async () => {
      const pb = await getInventoryAdminPb();
      const { BISNIS_COLLECTIONS } = await import("@/lib/bisnis/types");

      const [warehouses, companies, stores] = await Promise.all([
        pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseDirectoryRow>({
          sort: "code",
          fields: "id,code,name,address,company,store,warehouse_role,is_active,is_primary",
          requestKey: null,
        }),
        pb
          .collection(BISNIS_COLLECTIONS.companyProfile)
          .getFullList<{ id: string; company_name?: string; code?: string }>({
            sort: "company_name",
            fields: "id,company_name,code,is_active",
            requestKey: null,
          })
          .catch(() => []),
        pb
          .collection(BISNIS_COLLECTIONS.stores)
          .getFullList<{ id: string; name?: string; code?: string; company?: string; is_active?: boolean }>({
            sort: "name",
            fields: "id,name,code,company,is_active",
            requestKey: null,
          })
          .catch(() => []),
      ]);

      return {
        warehouses,
        companies: companies.filter((c) => c),
        stores,
      };
    },
    60_000,
  );
}

export function invalidateWarehouseDirectoryCache(): void {
  invalidateStockCache("inventory:warehouse-directory");
}
