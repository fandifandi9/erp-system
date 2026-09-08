import type PocketBase from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrderLine } from "@/lib/bisnis/types";
import type { PosCart } from "@/lib/pos/types";
import type { OutboundLineState, OutboundWorkflow } from "./outbound-workflow";

export type SalesLineSerialInput = {
  product: string;
  qty: number;
  serials?: string[];
  serial_numbers_json?: string | null;
  name?: string;
};

export function parseSerialNumbersJson(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function serializeSerialNumbersJson(values: string[]): string | undefined {
  const clean = values.map((v) => v.trim()).filter(Boolean);
  return clean.length > 0 ? JSON.stringify(clean) : undefined;
}

export function lineSerialsComplete(line: OutboundLineState, requiresSerial: boolean): boolean {
  if (!requiresSerial) return true;
  const sns = line.serial_numbers ?? [];
  return sns.length >= line.qty_required && sns.every(Boolean);
}

export function isPickSerialsComplete(
  wf: OutboundWorkflow,
  requiresByProduct: Record<string, boolean>,
): boolean {
  const lines = Object.values(wf.pick?.lines ?? {});
  if (lines.length === 0) return false;
  return lines.every((l) => lineSerialsComplete(l, !!requiresByProduct[l.product_id]));
}

export async function syncSerialsToOrderLines(
  soId: string,
  wf: OutboundWorkflow,
): Promise<void> {
  const lines = await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).getFullList<SalesOrderLine>({
    filter: `sales_order = "${soId.replace(/"/g, '\\"')}"`,
    requestKey: null,
  });
  const pickLines = wf.pick?.lines ?? {};
  await Promise.all(
    lines.map(async (row) => {
      const sns = pickLines[row.product]?.serial_numbers ?? [];
      if (sns.length === 0) return;
      const json = serializeSerialNumbersJson(sns);
      if (json === row.serial_numbers_json) return;
      await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).update(row.id, {
        serial_numbers_json: json,
      });
    }),
  );
}

export function serialsForSalesLine(line: SalesLineSerialInput): string[] {
  if (line.serials?.length) {
    return line.serials.map((s) => s.trim()).filter(Boolean);
  }
  return parseSerialNumbersJson(line.serial_numbers_json);
}

export function validateSalesLineSerials(
  lines: SalesLineSerialInput[],
  requiresByProduct: Record<string, boolean>,
  nameByProduct?: Record<string, string>,
): string | null {
  for (const l of lines) {
    if (!requiresByProduct[l.product]) continue;
    const sns = serialsForSalesLine(l);
    if (sns.length < l.qty) {
      const label = nameByProduct?.[l.product] ?? l.name ?? "produk";
      return `Lengkapi serial number untuk "${label}" (${sns.length}/${l.qty} unit).`;
    }
  }
  return null;
}

export function assertSalesLineSerials(
  lines: SalesLineSerialInput[],
  requiresByProduct: Record<string, boolean>,
  nameByProduct?: Record<string, string>,
): void {
  const msg = validateSalesLineSerials(lines, requiresByProduct, nameByProduct);
  if (msg) throw new Error(msg);
}

export function validatePosCartSerials(cart: PosCart): string | null {
  for (const l of cart.lines) {
    if (!l.requiresSerial) continue;
    const sns = (l.serials ?? []).map((s) => s.trim()).filter(Boolean);
    if (sns.length < l.qty) {
      return `Lengkapi serial number untuk "${l.name}" (${sns.length}/${l.qty} unit).`;
    }
  }
  return null;
}

export function assertPosCartSerials(cart: PosCart): void {
  const msg = validatePosCartSerials(cart);
  if (msg) throw new Error(msg);
}

export function parseImportLineSerials(feeOverrideJson?: string | null): string[] {
  if (!feeOverrideJson?.trim()) return [];
  try {
    const o = JSON.parse(feeOverrideJson) as { serial_numbers?: unknown };
    if (!Array.isArray(o.serial_numbers)) return [];
    return o.serial_numbers.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function mergeImportLineSerials(
  feeOverrideJson: string | undefined | null,
  serials: string[],
): string {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(feeOverrideJson ?? "{}") as Record<string, unknown>;
  } catch {
    base = {};
  }
  const clean = serials.map((s) => s.trim()).filter(Boolean);
  return JSON.stringify({ ...base, serial_numbers: clean });
}

async function loadRequiresSerialMap(
  client: PocketBase,
  productIds: string[],
): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  const unique = [...new Set(productIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 40) {
    chunks.push(unique.slice(i, i + 40));
  }

  for (const chunk of chunks) {
    const filter = chunk.map((id) => `id = "${id.replace(/"/g, '\\"')}"`).join(" || ");
    try {
      const rows = await client.collection("inv_products").getFullList<{ id: string; requires_serial?: boolean }>({
        filter,
        fields: "id,requires_serial",
        requestKey: null,
      });
      for (const row of rows) {
        map[row.id] = !!row.requires_serial;
      }
    } catch {
      /* ignore chunk */
    }
  }

  for (const pid of unique) {
    if (!(pid in map)) map[pid] = false;
  }
  return map;
}

export async function fetchRequiresSerialMap(productIds: string[]): Promise<Record<string, boolean>> {
  return loadRequiresSerialMap(pb, productIds);
}

export async function fetchRequiresSerialMapServer(
  adminPb: PocketBase,
  productIds: string[],
): Promise<Record<string, boolean>> {
  return loadRequiresSerialMap(adminPb, productIds);
}
