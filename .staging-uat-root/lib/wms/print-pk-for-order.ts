import type { SalesOrder } from "@/lib/bisnis/types";
import { getPkIdentityView } from "@/lib/wms/pk-identity";
import { printPkReceipt } from "@/lib/wms/print-pk-receipt";

export async function printPkForSalesOrder(so: SalesOrder): Promise<boolean> {
  const pk = getPkIdentityView(so);
  if (!pk.pkNo || pk.pkNo === "—") return false;
  await printPkReceipt({
    pkNo: pk.pkNo,
    qrPayload: pk.qrPayload,
    orderNo: so.order_no,
    customerName: so.expand?.customer?.name,
    warehouseName: so.expand?.warehouse?.name,
  });
  return true;
}
