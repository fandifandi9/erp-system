import type PocketBase from "pocketbase";
import type { SalesOrderLine } from "@/lib/bisnis/types";
import { expandLinesForStock } from "@/lib/catalog/bundle-expand";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { OutboundLineState, OutboundWorkflow } from "./outbound-workflow";

function parseSerials(json?: string): string[] | undefined {
  if (!json?.trim()) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const serials = parsed.map((x) => String(x).trim()).filter(Boolean);
    return serials.length ? serials : undefined;
  } catch {
    return undefined;
  }
}

/** Merge SO lines ke workflow pick — bundle di-expand ke komponen fisik. */
export async function mergeOutboundLinesFromSoExpanded(
  pb: PocketBase,
  wf: OutboundWorkflow,
  lines: SalesOrderLine[],
): Promise<OutboundWorkflow> {
  if (lines.length === 0) {
    return {
      ...wf,
      pick: {
        user_id: wf.pick?.user_id ?? "",
        user_name: wf.pick?.user_name,
        started_at: wf.pick?.started_at ?? "",
        completed_at: wf.pick?.completed_at ?? "",
        warehouse_id: wf.pick?.warehouse_id,
        lines: { ...(wf.pick?.lines ?? {}) },
      },
    };
  }

  const expanded = await expandLinesForStock(
    pb,
    lines.map((l) => ({
      product: l.product,
      qty: Number(l.qty) || 0,
      sku_snapshot: l.sku_snapshot,
      name_snapshot: l.name_snapshot,
      sales_order_line_id: l.id,
    })),
  );

  const bundleIds = [
    ...new Set(
      expanded
        .map((r) => r.source.bundle_product_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const bundleMeta = new Map<string, { sku?: string; name?: string }>();
  if (bundleIds.length > 0) {
    const filter = bundleIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
    const rows = await pb.collection(INV_COLLECTIONS.products).getFullList<{
      id: string;
      sku: string;
      name: string;
    }>({
      filter,
      fields: "id,sku,name",
      requestKey: null,
    });
    for (const row of rows) {
      bundleMeta.set(row.id, { sku: row.sku, name: row.name });
    }
  }

  const serialBySoLine = new Map<string, string[] | undefined>();
  for (const l of lines) {
    if ((l.expand?.product as { product_type?: string } | undefined)?.product_type === "bundle") {
      continue;
    }
    const serials = parseSerials(l.serial_numbers_json);
    if (serials) serialBySoLine.set(l.id, serials);
  }

  const componentIds = [...new Set(expanded.map((r) => r.product))];
  const componentMeta = new Map<string, { sku?: string; name?: string }>();
  if (componentIds.length > 0) {
    const filter = componentIds.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
    const rows = await pb.collection(INV_COLLECTIONS.products).getFullList<{
      id: string;
      sku: string;
      name: string;
    }>({
      filter,
      fields: "id,sku,name",
      requestKey: null,
    });
    for (const row of rows) {
      componentMeta.set(row.id, { sku: row.sku, name: row.name });
    }
  }

  const pickLines: Record<string, OutboundLineState & { for_bundle_product_id?: string; for_bundle_label?: string }> =
    {};

  // Progres picking/validasi yang sudah tercatat — jangan hilang saat merge ulang.
  const priorLines = wf.pick?.lines ?? {};

  for (const row of expanded) {
    const prev = pickLines[row.product];
    const comp = componentMeta.get(row.product);
    const bundleId = row.source.bundle_product_id;
    const bundle = bundleId ? bundleMeta.get(bundleId) : undefined;
    const bundleLabel = bundle ? `${bundle.sku ?? ""} ${bundle.name ?? ""}`.trim() : undefined;

    let serials: string[] | undefined;
    if (row.source.parent_line_id) {
      serials = serialBySoLine.get(row.source.parent_line_id);
    }

    if (!prev) {
      const priorState = priorLines[row.product];
      pickLines[row.product] = {
        product_id: row.product,
        sku: comp?.sku,
        name: comp?.name,
        qty_required: row.qty,
        // Pertahankan progres yang sudah ada (qty_picked/qty_validated) agar
        // complete_pick tidak salah menganggap picking belum lengkap.
        qty_picked: priorState?.qty_picked ?? 0,
        qty_validated: priorState?.qty_validated ?? 0,
        serial_numbers: priorState?.serial_numbers?.length
          ? priorState.serial_numbers
          : serials,
        ...(bundleId
          ? {
              for_bundle_product_id: bundleId,
              for_bundle_label: bundleLabel,
            }
          : {}),
      };
    } else {
      prev.qty_required += row.qty;
      if (!prev.serial_numbers?.length && serials?.length) {
        prev.serial_numbers = serials;
      }
    }
  }

  return {
    ...wf,
    pick: {
      user_id: wf.pick?.user_id ?? "",
      user_name: wf.pick?.user_name,
      started_at: wf.pick?.started_at ?? "",
      completed_at: wf.pick?.completed_at ?? "",
      warehouse_id: wf.pick?.warehouse_id,
      lines: pickLines,
    },
  };
}
