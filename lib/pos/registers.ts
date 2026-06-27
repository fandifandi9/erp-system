import type { PosRegister } from "@/lib/pos/types";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request gagal (${res.status})`);
  }
  return data as T;
}

export async function fetchPosRegisters(activeOnly = true): Promise<PosRegister[]> {
  try {
    return await apiJson<PosRegister[]>(`/api/pos/registers?active=${activeOnly ? "1" : "0"}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("404") || msg.includes("collection")) {
      return [];
    }
    throw e;
  }
}

export async function createPosRegister(data: {
  code: string;
  name: string;
  address?: string;
  notes?: string;
}): Promise<PosRegister> {
  return apiJson<PosRegister>("/api/pos/registers", {
    method: "POST",
    body: JSON.stringify({
      code: data.code.trim(),
      name: data.name.trim(),
      address: data.address?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      is_active: true,
    }),
  });
}

export async function updatePosRegister(
  id: string,
  data: Partial<Pick<PosRegister, "code" | "name" | "address" | "notes" | "is_active">>,
): Promise<PosRegister> {
  return apiJson<PosRegister>(`/api/pos/registers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deletePosRegister(id: string): Promise<boolean> {
  await apiJson<{ ok: boolean }>(`/api/pos/registers/${id}`, { method: "DELETE" });
  return true;
}
