import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type {
  InvMovement,
  InvMovementLine,
  InvProduct,
  InvStaffActivity,
  InvStockBalance,
  InvWarehouse,
  InvZone,
  InvZoneSession,
  MovementType,
} from "@/lib/inventory/types";

export async function fetchWarehouses(activeOnly = true) {
  const filter = activeOnly ? "is_active = true" : "";
  const res = await pb.collection(INV_COLLECTIONS.warehouses).getList(1, 100, {
    sort: "code",
    filter: filter || undefined,
  });
  return res.items as unknown as InvWarehouse[];
}

export async function fetchProducts(params?: { q?: string; page?: number }) {
  const page = params?.page ?? 1;
  let filter = "is_active = true";
  const q = (params?.q || "").trim();
  if (q) {
    const esc = q.replace(/"/g, '\\"');
    filter += ` && (sku ~ "${esc}" || name ~ "${esc}" || barcode ~ "${esc}")`;
  }
  const res = await pb.collection(INV_COLLECTIONS.products).getList(page, 50, {
    sort: "sku",
    filter,
  });
  return res;
}

export async function fetchBalances(warehouseId?: string, productId?: string) {
  const parts: string[] = [];
  if (warehouseId) parts.push(`warehouse = "${warehouseId}"`);
  if (productId) parts.push(`product = "${productId}"`);
  const res = await pb.collection(INV_COLLECTIONS.balances).getList(1, 200, {
    sort: "-updated",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "product,warehouse,location",
  });
  return res.items as unknown as InvStockBalance[];
}

async function enrichMovementTotals(items: InvMovement[]): Promise<InvMovement[]> {
  return Promise.all(
    items.map(async (m) => {
      if ((m.total_qty ?? 0) > 0) return m;
      try {
        const lines = (await pb.collection(INV_COLLECTIONS.movementLines).getFullList({
          filter: `movement = "${m.id}"`,
        })) as unknown as InvMovementLine[];
        const total_qty = lines.reduce(
          (s, l) => s + Math.abs(Number(l.qty) || 0),
          0
        );
        return { ...m, total_qty, line_count: lines.length };
      } catch {
        return m;
      }
    })
  );
}

export async function fetchMovements(params?: {
  status?: string;
  warehouseId?: string;
  page?: number;
}) {
  const parts: string[] = [];
  if (params?.status) parts.push(`status = "${params.status}"`);
  if (params?.warehouseId) parts.push(`warehouse = "${params.warehouseId}"`);
  const res = await pb.collection(INV_COLLECTIONS.movements).getList(params?.page ?? 1, 30, {
    sort: "-created",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "warehouse,created_by,posted_by",
  });
  const items = await enrichMovementTotals(res.items as unknown as InvMovement[]);
  return { ...res, items };
}

export async function fetchMovementDetail(id: string) {
  const movement = await pb.collection(INV_COLLECTIONS.movements).getOne(id, {
    expand: "warehouse,created_by,posted_by",
  });
  const lines = await pb.collection(INV_COLLECTIONS.movementLines).getFullList({
    filter: `movement = "${id}"`,
    expand: "product",
  });
  return {
    movement: movement as unknown as InvMovement,
    lines,
  };
}

export async function saveProduct(data: Partial<InvProduct> & { sku: string; name: string }) {
  if (data.id) {
    return pb.collection(INV_COLLECTIONS.products).update(data.id, data);
  }
  return pb.collection(INV_COLLECTIONS.products).create({
    uom: "pcs",
    min_stock: 0,
    is_active: true,
    ...data,
  });
}

export async function createMovementDraft(input: {
  movement_type: MovementType;
  warehouse: string;
  from_location?: string;
  to_location?: string;
  notes?: string;
  lines: { product: string; qty: number }[];
  post?: boolean;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }
  const res = await fetch("/api/inventory/movements", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { ok: boolean; data?: { id: string }; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal membuat movement.");
  return json.data!;
}

export async function fetchZones(warehouseId?: string) {
  const filter = warehouseId ? `warehouse = "${warehouseId}"` : "";
  const res = await pb.collection(INV_COLLECTIONS.zones).getList(1, 200, {
    sort: "code",
    filter: filter || undefined,
    expand: "warehouse",
  });
  return res.items as unknown as InvZone[];
}

export async function fetchActiveZoneSession() {
  const headers: Record<string, string> = {};
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch("/api/inventory/zones/sessions/active", {
    headers,
    credentials: "include",
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: InvZoneSession | null;
    error?: string;
  };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal memuat sesi zona.");
  return json.data ?? null;
}

export async function zoneCheckIn(input: { qr_payload?: string; zone_id?: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch("/api/inventory/zones/checkin", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { ok: boolean; data?: InvZoneSession; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-in gagal.");
  return json.data!;
}

export async function zoneCheckOut(sessionId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch("/api/inventory/zones/checkout", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
  });
  const json = (await res.json()) as { ok: boolean; data?: InvZoneSession; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error || "Check-out gagal.");
  return json.data!;
}

export async function fetchStaffActivities(params?: {
  warehouseId?: string;
  userId?: string;
  page?: number;
}) {
  const { enrichStaffActivities } = await import("@/lib/inventory/display");
  const parts: string[] = [];
  if (params?.warehouseId) parts.push(`warehouse = "${params.warehouseId}"`);
  if (params?.userId) parts.push(`user = "${params.userId}"`);
  const res = await pb.collection(INV_COLLECTIONS.staffActivities).getList(params?.page ?? 1, 40, {
    sort: "-occurred_at",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "user,zone,warehouse",
  });
  const items = res.items as unknown as InvStaffActivity[];

  const [warehouses, zones] = await Promise.all([fetchWarehouses(false), fetchZones()]);
  const whById = Object.fromEntries(warehouses.map((w) => [w.id, w]));
  const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));

  return enrichStaffActivities(items, whById, zoneById);
}

export async function postMovement(id: string) {
  const headers: Record<string, string> = {};
  if (pb.authStore.token) {
    headers.Authorization = `Bearer ${pb.authStore.token}`;
  }
  const res = await fetch(`/api/inventory/movements/${id}/post`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: { movement_no: string } };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal posting movement.");
  return json.data!;
}
