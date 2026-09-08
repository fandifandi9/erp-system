"use client";

import { pb } from "@/lib/pocketbase";

import type { PayslipPdfInput } from "@/lib/hr/payroll-slip-pdf";

export type StaffPayslipClient = PayslipPdfInput & {
  item_status: string;
  is_demo?: boolean;
};

async function parseJson(res: Response): Promise<{ ok?: boolean; error?: string; data?: unknown; items?: unknown[] }> {
  return (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: unknown;
    items?: unknown[];
  };
}

export async function fetchSelfPayslipsApi(): Promise<StaffPayslipClient[]> {
  const res = await fetch("/api/payroll/self/slips", { credentials: "include" });
  const data = await parseJson(res);
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Gagal memuat slip gaji.");
  }
  return (data.items ?? []) as StaffPayslipClient[];
}

export async function fetchSelfPayslipByIdApi(id: string): Promise<StaffPayslipClient> {
  const res = await fetch(`/api/payroll/self/slips/${encodeURIComponent(id)}`, { credentials: "include" });
  const data = await parseJson(res);
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "Slip gaji tidak ditemukan.");
  }
  return data.data as StaffPayslipClient;
}

export function payslipPreviewUrl(id: string): string {
  return `/api/payroll/self/slips/${encodeURIComponent(id)}/pdf?inline=1`;
}

export function payslipDownloadUrl(id: string): string {
  return `/api/payroll/self/slips/${encodeURIComponent(id)}/pdf`;
}

function payslipAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

/** Fetch slip HTML for in-page preview (avoids iframe + X-Frame-Options: DENY). */
export async function fetchPayslipPreviewHtml(id: string): Promise<string> {
  const res = await fetch(payslipPreviewUrl(id), {
    credentials: "include",
    headers: payslipAuthHeaders(),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || ct.includes("application/json")) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(data.error || "Gagal memuat preview slip gaji.") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }
  return res.text();
}

/** Download slip via authenticated fetch (reliable vs bare anchor). */
export async function downloadPayslipHtml(id: string): Promise<void> {
  const res = await fetch(payslipDownloadUrl(id), {
    credentials: "include",
    headers: payslipAuthHeaders(),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok || ct.includes("application/json")) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(data.error || "Gagal mengunduh slip gaji.") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `slip-gaji-${id.slice(0, 8)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
