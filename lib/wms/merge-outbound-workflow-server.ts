import type { SalesOrderLine } from "@/lib/bisnis/types";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { getCatalogPb } from "@/lib/catalog/api-server";
import { mergeOutboundLinesFromSoExpanded } from "@/lib/wms/outbound-bundle-expand";
import type { OutboundWorkflow } from "@/lib/wms/outbound-workflow";

/** Expand bundle → komponen fisik memakai admin PB (koleksi bundle lines admin-only). */
export async function mergeOutboundWorkflowServer(
  salesOrderId: string,
  workflow: OutboundWorkflow,
): Promise<OutboundWorkflow> {
  const pb = await getCatalogPb();
  const lines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${salesOrderId.replace(/"/g, '\\"')}"`,
    expand: "product",
    requestKey: null,
  });
  return mergeOutboundLinesFromSoExpanded(pb, workflow, lines);
}
