import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { parseOutboundWorkflow } from "./outbound-workflow";
import { getPackageIdentityView } from "./package-identity";
import { getPkFromSo } from "./pk-identity";

export type ValidateOrderContext = {
  orderNo: string;
  customerName: string;
  pkNo: string;
  packageCode: string;
  packageCodeType: "awb" | "internal";
  warehouseName: string;
  courier: string;
  marketplace: string;
};

export function resolveMarketplaceLabel(so: SalesOrder): string {
  const notes = (so.notes ?? "").toLowerCase();
  if (notes.includes("shopee")) return "Shopee";
  if (notes.includes("tokopedia") || notes.includes("tokped")) return "Tokopedia";
  if (notes.includes("tiktok")) return "TikTok Shop";
  if (notes.includes("lazada")) return "Lazada";
  if (notes.includes("blibli")) return "Blibli";
  if (notes.includes("bukalapak")) return "Bukalapak";
  if (notes.includes("marketplace") || notes.includes("penjualan online")) return "Marketplace";
  const { shipping } = parseNotesWithShipping(so.notes ?? "");
  if (shipping.tracking_no?.trim() && shipping.courier?.trim()) {
    return shipping.courier.trim();
  }
  return "Toko / Manual";
}

/** Isi expand gudang/pelanggan jika hilang setelah update PB (tanpa expand). */
export async function hydrateSalesOrderDisplay(so: SalesOrder): Promise<SalesOrder> {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const meta = wf.order_meta;
  const hasWh = !!(meta?.warehouse_name?.trim() || so.expand?.warehouse?.name?.trim());
  const hasCust = !!(meta?.customer_name?.trim() || so.expand?.customer?.name?.trim());
  if (hasWh && hasCust) return so;

  const expand = { ...so.expand };
  if (!hasWh && so.warehouse) {
    try {
      const w = await pb.collection(INV_COLLECTIONS.warehouses).getOne(so.warehouse, {
        requestKey: null,
      });
      expand.warehouse = {
        id: w.id,
        code: String((w as { code?: string }).code ?? ""),
        name: String((w as { name?: string }).name ?? "—"),
      };
    } catch {
      /* optional */
    }
  }
  if (!hasCust && so.customer) {
    try {
      const c = await pb.collection(BISNIS_COLLECTIONS.customers).getOne(so.customer, {
        requestKey: null,
      });
      expand.customer = c as unknown as NonNullable<SalesOrder["expand"]>["customer"];
    } catch {
      /* optional */
    }
  }
  return { ...so, expand };
}

export function buildValidateOrderContext(so: SalesOrder): ValidateOrderContext {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const meta = wf.order_meta;
  const pkg = getPackageIdentityView(so, wf);
  const pkNo = getPkFromSo(so) ?? "—";
  const { shipping } = parseNotesWithShipping(so.notes ?? "");
  return {
    orderNo: so.order_no,
    customerName: meta?.customer_name?.trim() || so.expand?.customer?.name?.trim() || "—",
    pkNo,
    packageCode: pkNo !== "—" ? pkNo : pkg.code,
    packageCodeType: pkNo !== "—" ? "internal" : pkg.type,
    warehouseName: meta?.warehouse_name?.trim() || so.expand?.warehouse?.name?.trim() || "—",
    courier: meta?.courier?.trim() || shipping.courier?.trim() || "—",
    marketplace: resolveMarketplaceLabel(so),
  };
}
