import { getWmsRouteBadge } from "@/lib/bisnis/wms-order-filters";
import type { PurchaseOrder, SalesOrder } from "@/lib/bisnis/types";

type Props = {
  order?: Pick<
    SalesOrder | PurchaseOrder,
    "send_to_warehouse_at" | "warehouse_process_status" | "status"
  > | null;
  kind: "sales" | "purchase";
};

export function WmsRouteBadge({ order, kind }: Props) {
  const { label, cls } = getWmsRouteBadge(order, kind);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}
