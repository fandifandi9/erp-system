import type { OutboundWorkflow } from "@/lib/wms/outbound-workflow";

/** Client-side: merge workflow via API agar bundle lines dibaca dengan hak admin. */
export async function mergeOutboundWorkflowForOrder(
  salesOrderId: string,
  workflow: OutboundWorkflow,
): Promise<OutboundWorkflow> {
  const res = await fetch("/api/wms/outbound-workflow/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ salesOrderId, workflow }),
  });
  const body = (await res.json()) as { ok?: boolean; workflow?: OutboundWorkflow; error?: string };
  if (!res.ok || !body.ok || !body.workflow) {
    throw new Error(body.error || "Gagal memuat baris picking (expand bundle).");
  }
  return body.workflow;
}
