import { pb } from "@/lib/pocketbase";
import type { InboundQueuePayload } from "@/lib/wms/inbound-queue-server";

export async function fetchInboundQueue(): Promise<InboundQueuePayload> {
  const headers: Record<string, string> = {};
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch("/api/wms/inbound-queue", {
    credentials: "include",
    headers,
  });
  const json = (await res.json()) as { ok: boolean; data?: InboundQueuePayload; error?: string };
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || "Gagal memuat antrean penerimaan.");
  }
  return json.data;
}
