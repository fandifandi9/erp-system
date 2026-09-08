import type { InvProduct } from "@/lib/inventory/types";

export type ProductType = "simple" | "bundle";

export type ProductLifecycleStatus = "draft" | "active" | "inactive";

export type CatalogViewRole = "owner" | "commercial" | "warehouse" | "finance";

export type CatalogProduct = InvProduct & {
  product_type?: ProductType;
  lifecycle_status?: ProductLifecycleStatus;
  commercial_ready_at?: string;
  commercial_ready_by?: string;
  created_by_role?: string;
};

export type CatalogProductListItem = {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  uom?: string;
  product_type: ProductType;
  lifecycle_status: ProductLifecycleStatus;
  requires_serial?: boolean;
  min_stock?: number;
  image?: string;
  image_2?: string;
  image_3?: string;
  category?: string;
  brand?: string;
  sell_price?: number;
  buy_price?: number;
  is_active?: boolean;
  commercial_ready_at?: string;
  expand?: InvProduct["expand"];
};

export type CatalogProductPayload = {
  sku: string;
  name: string;
  barcode?: string;
  description?: string;
  uom?: string;
  min_stock?: number;
  sell_price?: number;
  category?: string;
  brand?: string;
  requires_serial?: boolean;
  product_type?: ProductType;
  lifecycle_status?: ProductLifecycleStatus;
};

export type BundleLine = {
  id: string;
  bundle_product: string;
  component_product: string;
  qty: number;
  sort_order?: number;
  is_active?: boolean;
  expand?: {
    component_product?: Pick<CatalogProduct, "id" | "sku" | "name" | "barcode" | "lifecycle_status" | "product_type">;
  };
};

export type BundleLineInput = {
  component_product: string;
  qty: number;
  sort_order?: number;
  is_active?: boolean;
};

export type SaleLineInput = {
  product: string;
  qty: number;
  sku_snapshot?: string;
  name_snapshot?: string;
  sales_order_line_id?: string;
};

export type StockLineOutput = {
  product: string;
  qty: number;
  source: {
    kind: "simple" | "bundle_component";
    bundle_product_id?: string;
    bundle_qty?: number;
    parent_line_id?: string;
  };
};
