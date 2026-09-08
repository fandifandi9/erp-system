import type { AwbSource } from "./awb-label";
import type { SalesOrder } from "./types";

export type AwbLabelInfo = {
  ok: boolean;
  has_file: boolean;
  url: string | null;
  filename: string | null;
  tracking_no: string | null;
  awb_ready_at: string | null;
  awb_source: AwbSource | null;
};

const AWB_CACHE_TTL_MS = 60_000;
const awbCache = new Map<string, { data: AwbLabelInfo; at: number }>();
const awbInflight = new Map<string, Promise<AwbLabelInfo>>();

export function invalidateAwbLabelCache(salesOrderId?: string): void {
  if (salesOrderId) {
    awbCache.delete(salesOrderId);
    awbInflight.delete(salesOrderId);
    return;
  }
  awbCache.clear();
  awbInflight.clear();
}

export function peekAwbLabelCache(salesOrderId: string): AwbLabelInfo | null {
  const hit = awbCache.get(salesOrderId);
  if (!hit || Date.now() - hit.at >= AWB_CACHE_TTL_MS) return null;
  return hit.data;
}

/** Prefetch di background saat halaman edit SO dibuka. */
export function prefetchAwbLabelInfo(salesOrderId: string): void {
  void fetchAwbLabelInfo(salesOrderId).catch(() => {});
}

export async function fetchAwbLabelInfo(salesOrderId: string): Promise<AwbLabelInfo> {
  const hit = awbCache.get(salesOrderId);
  if (hit && Date.now() - hit.at < AWB_CACHE_TTL_MS) return hit.data;

  let inflight = awbInflight.get(salesOrderId);
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/awb`, {
        credentials: "include",
      });
      const data = (await res.json()) as AwbLabelInfo & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat label AWB");
      awbCache.set(salesOrderId, { data, at: Date.now() });
      awbInflight.delete(salesOrderId);
      return data;
    })().catch((e) => {
      awbInflight.delete(salesOrderId);
      throw e;
    });
    awbInflight.set(salesOrderId, inflight);
  }
  return inflight;
}

export async function uploadAwbLabel(
  salesOrderId: string,
  file: File,
  source: AwbSource = "manual",
): Promise<SalesOrder> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("source", source);
  const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/awb`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const data = (await res.json()) as SalesOrder & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload label AWB gagal");
  invalidateAwbLabelCache(salesOrderId);
  return data;
}

export async function removeAwbLabel(salesOrderId: string): Promise<void> {
  const res = await fetch(`/api/bisnis/sales-orders/${salesOrderId}/awb`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Gagal menghapus label AWB");
  invalidateAwbLabelCache(salesOrderId);
}
