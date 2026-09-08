"use client";

import { pb } from "@/lib/pocketbase";

export function hrApiAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

async function parseHrApiResponse(res: Response): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    data?: unknown;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return { ok: true, data: json.data };
}

export async function hrApiListEmployees(options?: {
  companyId?: string | null;
}): Promise<
  Array<{
    id: string;
    userId: string;
    name: string;
    position: string;
    email: string;
    rolePresetId: string;
    dashboardAccess: boolean;
    status: string;
    leaveBookingsQuota: number;
    requireCheckinSelfie: boolean;
  }>
> {
  const qs = new URLSearchParams();
  if (options?.companyId != null && String(options.companyId).trim()) {
    qs.set("companyId", String(options.companyId).trim());
  }
  const url = qs.toString() ? `/api/hr/employees?${qs}` : "/api/hr/employees";
  const res = await fetch(url, {
    method: "GET",
    headers: hrApiAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    items?: unknown;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return Array.isArray(json.items) ? (json.items as Array<{
    id: string;
    userId: string;
    name: string;
    position: string;
    email: string;
    rolePresetId: string;
    dashboardAccess: boolean;
    status: string;
    leaveBookingsQuota: number;
    requireCheckinSelfie: boolean;
  }>) : [];
}

export async function hrApiGetEmployee(userId: string): Promise<{
  user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    role_code?: string;
    inventory_role?: string;
    hr_role_preset?: string;
    dashboard_access?: boolean;
    status?: string;
  };
  profile: Record<string, unknown> | null;
  profileId: string | null;
  primaryEntityId: string;
  offices: Array<{ id: string; name: string }>;
  organization?: {
    orgPositionId: string | null;
    orgPositionName: string | null;
    derivedSuperior: {
      parentPositionId: string | null;
      parentPositionName: string | null;
      superiorUserId: string | null;
      superiorName: string | null;
      vacant: boolean;
    };
    positions: Array<{
      id: string;
      name: string;
      filled: boolean;
      parentPositionId?: string | null;
      holderName?: string | null;
      holderNames?: string[] | null;
    }>;
    managerIsDerived: boolean;
    isSelf: boolean;
    /** Phase 35I-F3 */
    contextCompanyId?: string | null;
    assignmentSource?: "assignment" | "profile_fallback" | "none";
    otherAssignments?: Array<{
      id?: string;
      companyId: string;
      orgPositionId: string;
      isActive?: boolean;
    }>;
  };
  actor: {
    canView: boolean;
    canUpdate: boolean;
    canViewSensitive: boolean;
    canAssignManager: boolean;
    canManageAccounts: boolean;
    canViewEntities: boolean;
    canAssignMembership: boolean;
  };
  defaults: { leaveBookingsQuota: number };
}> {
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: hrApiAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  const parsed = await parseHrApiResponse(res);
  return parsed.data as Awaited<ReturnType<typeof hrApiGetEmployee>>;
}

export async function hrApiPatchEmployee(
  userId: string,
  body: Record<string, unknown>,
): Promise<{ userId: string; profileId: string | null }> {
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: hrApiAuthHeaders(),
    body: JSON.stringify(body),
  });
  const parsed = await parseHrApiResponse(res);
  return parsed.data as { userId: string; profileId: string | null };
}

export async function hrApiActivateEmployee(userId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(userId)}/activate`, {
    method: "POST",
    headers: hrApiAuthHeaders(),
    body: JSON.stringify(reason ? { reason } : {}),
  });
  await parseHrApiResponse(res);
}

export async function hrApiDeactivateEmployee(userId: string, reason?: string): Promise<void> {
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(userId)}/deactivate`, {
    method: "POST",
    headers: hrApiAuthHeaders(),
    body: JSON.stringify(reason ? { reason } : {}),
  });
  await parseHrApiResponse(res);
}

export async function hrApiFetchAccessPreview(userId: string) {
  const res = await fetch(`/api/hr/employees/${encodeURIComponent(userId)}/access-preview`, {
    headers: hrApiAuthHeaders(),
  });
  const parsed = await parseHrApiResponse(res);
  return parsed.data;
}
