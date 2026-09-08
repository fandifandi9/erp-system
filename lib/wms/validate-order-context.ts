import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { parseNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { formatShippingCostId } from "@/lib/bisnis/shipping-wms-gate";
import { parseOutboundWorkflow } from "./outbound-workflow";
import { getPackageIdentityView } from "./package-identity";
import { getPkFromSo } from "./pk-identity";

export type ValidateOrderContext = {
  orderNo: string;
  customerName: string;
  pkNo: string;
  packageCode: string;
  packageCodeType: "awb" | "internal";
  storeName: string;
  courier: string;
  shippingService: string;
  recipientAddress: string;
  shippingCost: string;
  marketplace: string;
};

function marketplaceFromSerbaMpNotes(notes: string): string | null {
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(/^Marketplace:\s*(.+)$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

export function resolveMarketplaceLabel(so: SalesOrder): string {
  const platform = so.platform_source?.trim();
  if (platform) return platform;

  const fromMp = marketplaceFromSerbaMpNotes(so.notes ?? "");
  if (fromMp) return fromMp;

  const storeName = so.expand?.store?.name?.trim();
  if (storeName) return storeName;

  const notes = (so.notes ?? "").toLowerCase();
  if (notes.includes("shopee")) return "Shopee";
  if (notes.includes("tokopedia") || notes.includes("tokped")) return "Tokopedia";
  if (notes.includes("tiktok")) return "TikTok Shop";
  if (notes.includes("lazada")) return "Lazada";
  if (notes.includes("blibli")) return "Blibli";
  if (notes.includes("bukalapak")) return "Bukalapak";
  if (notes.includes("marketplace") || notes.includes("penjualan online")) return "Marketplace";

  return "Toko / Manual";
}

/** Isi expand pelanggan/toko jika hilang setelah update PB (tanpa expand). */
export async function hydrateSalesOrderDisplay(so: SalesOrder): Promise<SalesOrder> {
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const meta = wf.order_meta;
  const hasCust = !!(meta?.customer_name?.trim() || so.expand?.customer?.name?.trim());
  const hasStore = !!(meta?.store_name?.trim() || so.expand?.store?.name?.trim());
  if (hasCust && hasStore) return so;

  const expand = { ...so.expand };
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
  if (!hasStore && so.store) {
    try {
      const st = await pb.collection(BISNIS_COLLECTIONS.stores).getOne(so.store, {
        requestKey: null,
      });
      expand.store = st as unknown as NonNullable<SalesOrder["expand"]>["store"];
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
  const courier = meta?.courier?.trim() || shipping.courier?.trim() || "—";
  const shippingService =
    meta?.shipping_service?.trim() || shipping.shipping_service?.trim() || "—";
  const recipientAddress =
    meta?.recipient_address?.trim() || shipping.recipient_address?.trim() || "—";
  const cost = meta?.shipping_cost ?? shipping.shipping_cost ?? 0;
  const storeName =
    meta?.store_name?.trim() || so.expand?.store?.name?.trim() || "—";
  return {
    orderNo: so.order_no,
    customerName: meta?.customer_name?.trim() || so.expand?.customer?.name?.trim() || "—",
    pkNo,
    packageCode: pkNo !== "—" ? pkNo : pkg.code,
    packageCodeType: pkNo !== "—" ? "internal" : pkg.type,
    storeName,
    courier,
    shippingService,
    recipientAddress,
    shippingCost: formatShippingCostId(Number(cost) || 0),
    marketplace: resolveMarketplaceLabel(so),
  };
}
