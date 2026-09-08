import { pb } from "@/lib/pocketbase";
import type { WmsDashboardStats } from "@/lib/wms/dashboard-stats-server";

export async function fetchWmsDashboardStats(): Promise<WmsDashboardStats> {
  const headers: Record<string, string> = {};
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch("/api/wms/dashboard-stats", {
    credentials: "include",
    headers,
  });
  const json = (await res.json()) as { ok: boolean; data?: WmsDashboardStats; error?: string };
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || "Gagal memuat ringkasan gudang.");
  }
  return json.data;
}
