import JSZip from "jszip";
import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type SalesImportLine, type SalesOrder } from "./types";
import { normalizeAwbFilename } from "./awb-label";
import { parseImportHeaderFromJson } from "./mp-import-order-build";

export type AwbZipMatchRow = {
  mp_order_no: string;
  sales_order_id: string | null;
  tracking_no: string | null;
  has_awb_file: boolean;
};

export type AwbZipImportResult = {
  matched: number;
  uploaded: number;
  skipped: number;
  unmatched: string[];
  errors: { file: string; message: string }[];
};

const LABEL_EXT = /\.(pdf|png|jpe?g|webp)$/i;

function isLabelFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  if (base.startsWith(".") || base.startsWith("__MACOSX")) return false;
  return LABEL_EXT.test(base);
}

function fileBaseKey(name: string): string {
  const base = (name.split("/").pop() ?? name).replace(LABEL_EXT, "");
  return normalizeAwbFilename(base);
}

export async function loadBatchAwbMatchRows(
  adminPb: PocketBase,
  batchId: string,
): Promise<AwbZipMatchRow[]> {
  const lines = await adminPb.collection(BISNIS_COLLECTIONS.salesImportLines).getFullList<SalesImportLine>({
    filter: `batch = "${batchId.replace(/"/g, '\\"')}"`,
    expand: "invoice,invoice.sales_order",
    requestKey: null,
  });

  const byOrder = new Map<string, AwbZipMatchRow>();

  for (const line of lines) {
    if (!line.mp_order_no) continue;
    const existing = byOrder.get(line.mp_order_no);
    const inv = line.expand?.invoice;
    const soId =
      (inv?.sales_order as string | undefined) ??
      (inv?.expand?.sales_order as SalesOrder | undefined)?.id ??
      null;

    let tracking = existing?.tracking_no ?? null;
    if (!tracking) {
      const header = parseImportHeaderFromJson(line.fee_override_json);
      tracking = header?.no_resi?.trim() || null;
    }

    let hasFile = existing?.has_awb_file ?? false;
    if (soId && !hasFile) {
      try {
        const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
          fields: "id,awb_label",
          requestKey: null,
        });
        hasFile = !!so.awb_label;
      } catch {
        /* ignore */
      }
    }

    byOrder.set(line.mp_order_no, {
      mp_order_no: line.mp_order_no,
      sales_order_id: soId ?? existing?.sales_order_id ?? null,
      tracking_no: tracking,
      has_awb_file: hasFile,
    });
  }

  return [...byOrder.values()];
}

export function buildAwbZipLookup(rows: AwbZipMatchRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.sales_order_id) continue;
    const orderKey = normalizeAwbFilename(row.mp_order_no);
    if (orderKey) map.set(orderKey, row.sales_order_id);
    const resi = row.tracking_no?.trim();
    if (resi) map.set(normalizeAwbFilename(resi), row.sales_order_id);
  }
  return map;
}

export async function importAwbZipToBatch(
  adminPb: PocketBase,
  batchId: string,
  zipBuffer: ArrayBuffer,
): Promise<AwbZipImportResult> {
  const rows = await loadBatchAwbMatchRows(adminPb, batchId);
  const lookup = buildAwbZipLookup(rows);
  const zip = await JSZip.loadAsync(zipBuffer);

  const result: AwbZipImportResult = {
    matched: 0,
    uploaded: 0,
    skipped: 0,
    unmatched: [],
    errors: [],
  };

  const entries = Object.entries(zip.files).filter(([, f]) => !f.dir && isLabelFile(f.name));

  for (const [path, entry] of entries) {
    const key = fileBaseKey(path);
    if (!key) continue;

    const soId = lookup.get(key);
    if (!soId) {
      result.unmatched.push(path.split("/").pop() ?? path);
      continue;
    }

    result.matched++;

    try {
      const so = await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
        fields: "id,awb_label",
        requestKey: null,
      });
      if (so.awb_label) {
        result.skipped++;
        continue;
      }

      const buf = await entry.async("uint8array");
      const filename = path.split("/").pop() ?? "awb.pdf";
      const mime = /\.pdf$/i.test(filename)
        ? "application/pdf"
        : /\.png$/i.test(filename)
          ? "image/png"
          : /\.webp$/i.test(filename)
            ? "image/webp"
            : "image/jpeg";

      const fd = new FormData();
      const part = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      fd.set("awb_label", new Blob([part], { type: mime }), filename);
      fd.set("awb_ready_at", new Date().toISOString());
      fd.set("awb_source", "zip_import");

      await adminPb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, fd);
      result.uploaded++;
    } catch (e) {
      result.errors.push({
        file: path.split("/").pop() ?? path,
        message: e instanceof Error ? e.message : "Upload gagal",
      });
    }
  }

  return result;
}

/** Ringkasan batch untuk UI. */
export function summarizeAwbBatchRows(rows: AwbZipMatchRow[]) {
  const posted = rows.filter((r) => r.sales_order_id);
  const withFile = posted.filter((r) => r.has_awb_file);
  return {
    total_orders: rows.length,
    posted_orders: posted.length,
    with_awb_file: withFile.length,
    pending_awb: posted.length - withFile.length,
  };
}
