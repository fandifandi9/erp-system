import { pb } from "@/lib/pocketbase";
import { listWarehouseRooms } from "@/lib/inventory/warehouse-rooms";
import { isSalesWarehouse } from "@/lib/bisnis/warehouse-categories";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { LocationSaveInput } from "@/lib/inventory/location-save";
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
import {
  getProductImageUrl as getCatalogProductImageUrl,
  getProductImageUrls,
} from "@/lib/catalog/product-images";

import type {
  DamagedStockRow,
  DamagedWarehouseOption,
  DispositionLine,
  RetailWarehouseOption,
} from "@/lib/inventory/damaged-disposition";
import type { DamagedIntakeRef } from "@/lib/inventory/damaged-intake-refs";
import { getCachedWarehouses } from "@/lib/bisnis/master-data-cache";

async function readInvJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || "Permintaan inventory gagal."));
  }
  return data;
}

export type DamagedWriteOffExpense = {
  expenseId: string;
  expenseNo: string;
  total: number;
  kind?: "write_down" | "reversal" | "write_off";
};

export type DamagedDispositionResult = {
  expense?: DamagedWriteOffExpense | null;
  accounting?: DamagedWriteOffExpense | null;
};

export async function fetchDamagedWarehouseStock(params?: {
  companyId?: string;
  warehouseId?: string;
}): Promise<{
  warehouses: DamagedWarehouseOption[];
  items: DamagedStockRow[];
  intakeRefs: Record<string, DamagedIntakeRef[]>;
  retailByCompany: Record<string, RetailWarehouseOption[]>;
}> {
  const sp = new URLSearchParams();
  if (params?.companyId) sp.set("company", params.companyId);
  if (params?.warehouseId) sp.set("warehouse", params.warehouseId);
  const res = await fetch(`/api/inventory/damaged-stock?${sp}`, { cache: "no-store" });
  const data = await readInvJson(res);
  return {
    warehouses: (data.warehouses ?? []) as DamagedWarehouseOption[],
    items: (data.items ?? []) as DamagedStockRow[],
    intakeRefs: (data.intakeRefs ?? {}) as Record<string, DamagedIntakeRef[]>,
    retailByCompany: (data.retailByCompany ?? {}) as Record<string, RetailWarehouseOption[]>,
  };
}

export async function postDamagedDisposition(input: {
  action: "repair" | "write_off";
  damagedWarehouseId: string;
  companyId: string;
  lines: DispositionLine[];
  note?: string;
  repairTarget?: "entity" | "retail";
  targetWarehouseId?: string;
}): Promise<DamagedDispositionResult> {
  const res = await fetch("/api/inventory/damaged-disposition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action,
      damaged_warehouse: input.damagedWarehouseId,
      company: input.companyId,
      lines: input.lines,
      note: input.note,
      repair_target: input.repairTarget,
      target_warehouse: input.targetWarehouseId,
    }),
  });
  const data = await readInvJson(res);
  return {
    expense: (data.expense ?? null) as DamagedWriteOffExpense | null,
    accounting: (data.accounting ?? data.expense ?? null) as DamagedWriteOffExpense | null,
  };
}

export async function postDamagedReassign(input: {
  fromDamagedWarehouseId: string;
  toDamagedWarehouseId: string;
  lines: DispositionLine[];
  note: string;
}) {
  const res = await fetch("/api/inventory/damaged-disposition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "reassign",
      from_damaged_warehouse: input.fromDamagedWarehouseId,
      to_damaged_warehouse: input.toDamagedWarehouseId,
      lines: input.lines,
      note: input.note,
    }),
  });
  return readInvJson(res);
}

export async function fetchWarehouses(activeOnly = true) {
  return getCachedWarehouses(async () => {
    const filter = activeOnly ? "is_active = true" : "";
    const res = await pb.collection(INV_COLLECTIONS.warehouses).getList(1, 500, {
      sort: "code",
      filter: filter || undefined,
      fields: "id,code,name,store,company,is_active,warehouse_role",
    });
    return res.items as unknown as InvWarehouse[];
  });
}

export type WarehouseStockListResponse = {
  ok: boolean;
  items: InvStockBalance[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
  draftCount: number;
};

export async function fetchWarehouseStockList(params: {
  warehouseId: string;
  page?: number;
  perPage?: number;
  q?: string;
}): Promise<WarehouseStockListResponse> {
  const sp = new URLSearchParams();
  sp.set("warehouse", params.warehouseId);
  if (params.page) sp.set("page", String(params.page));
  if (params.perPage) sp.set("perPage", String(params.perPage));
  if (params.q?.trim()) sp.set("q", params.q.trim());
  const res = await fetch(`/api/inventory/stock?${sp}`, { cache: "no-store" });
  return readInvJson(res);
}

export type WarehouseDirectoryResponse = {
  ok: boolean;
  warehouses: Array<
    InvWarehouse & {
      address?: string;
      company?: string;
      store?: string;
      warehouse_role?: string;
      is_primary?: boolean;
    }
  >;
  companies: Array<{ id: string; company_name?: string; code?: string }>;
  stores: Array<{ id: string; name?: string; code?: string; company?: string; is_active?: boolean }>;
};

export async function fetchWarehouseDirectory(fresh = false): Promise<WarehouseDirectoryResponse> {
  const qs = fresh ? "?fresh=1" : "";
  const res = await fetch(`/api/inventory/warehouses/directory${qs}`, { cache: "no-store" });
  return readInvJson(res);
}

/** Gudang penjualan retail (role retail / terikat toko) — untuk preview stok jual bundle. */
export async function fetchSalesWarehouses(activeOnly = true) {
  const filter = activeOnly ? "is_active = true" : "";
  const res = await pb.collection(INV_COLLECTIONS.warehouses).getList(1, 200, {
    sort: "code",
    filter: filter || undefined,
    expand: "store",
  });
  return (res.items as unknown as Array<InvWarehouse & { warehouse_role?: string; store?: string; expand?: { store?: { name: string } } }>).filter(
    isSalesWarehouse,
  );
}

export async function fetchProducts(params?: {
  q?: string;
  page?: number;
  perPage?: number;
  expand?: string;
  /** Hanya produk boleh dijual (aktif — simple + bundle). */
  sellableOnly?: boolean;
  /** Semua status kecuali nonaktif — default untuk operasional gudang. */
  operationalOnly?: boolean;
}) {
  const page = params?.page ?? 1;
  const q = (params?.q || "").trim();
  const qPart = q
    ? ` && (sku ~ "${q.replace(/"/g, '\\"')}" || name ~ "${q.replace(/"/g, '\\"')}" || barcode ~ "${q.replace(/"/g, '\\"')}")`
    : "";

  const buildFilter = (base: string) => `${base}${qPart}`;

  const tryFilters = params?.sellableOnly
    ? [
        buildFilter('lifecycle_status = "active"'),
        buildFilter("is_active = true"),
      ]
    : params?.operationalOnly === false
      ? [buildFilter("")]
      : [
          buildFilter('(lifecycle_status = "active" || lifecycle_status = "draft")'),
          buildFilter("is_active = true"),
        ];

  let lastErr: unknown;
  for (const filter of tryFilters) {
    try {
      const res = await pb.collection(INV_COLLECTIONS.products).getList(page, params?.perPage ?? 50, {
        sort: "name",
        filter: filter || undefined,
        expand: params?.expand ?? "category,brand",
        requestKey: null,
      });
      return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
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
  const missing = items.filter((m) => !(Number(m.total_qty) > 0));
  if (missing.length === 0) return items;

  const totalsByMovement = new Map<string, { total_qty: number; line_count: number }>();
  try {
    const filter = missing.map((m) => `movement = "${m.id.replace(/"/g, '\\"')}"`).join(" || ");
    const lines = (await pb.collection(INV_COLLECTIONS.movementLines).getFullList({
      filter,
      fields: "movement,qty",
      requestKey: null,
    })) as unknown as InvMovementLine[];

    for (const line of lines) {
      const movementId = String(line.movement ?? "");
      if (!movementId) continue;
      const cur = totalsByMovement.get(movementId) ?? { total_qty: 0, line_count: 0 };
      cur.total_qty += Math.abs(Number(line.qty) || 0);
      cur.line_count += 1;
      totalsByMovement.set(movementId, cur);
    }
  } catch {
    return items;
  }

  return items.map((m) => {
    const agg = totalsByMovement.get(m.id);
    if (!agg) return m;
    return { ...m, total_qty: agg.total_qty, line_count: agg.line_count };
  });
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

export async function saveProduct(data: Partial<InvProduct> & { sku: string; name: string }, imageFile?: File | null) {
  const body: FormData | Record<string, unknown> = imageFile
    ? (() => {
        const fd = new FormData();
        Object.entries(data).forEach(([k, v]) => {
          if (v !== undefined && v !== null && k !== "id" && k !== "expand" && k !== "collectionId") {
            fd.append(k, typeof v === "number" || typeof v === "boolean" ? String(v) : (v as string));
          }
        });
        fd.append("image", imageFile);
        return fd;
      })()
    : data;

  if (data.id) {
    return pb.collection(INV_COLLECTIONS.products).update(data.id, body);
  }
  const lifecycle = (data as { lifecycle_status?: string }).lifecycle_status ?? "active";
  const lifecycleFields = {
    product_type: (data as { product_type?: string }).product_type ?? "simple",
    lifecycle_status: lifecycle,
    is_active: lifecycle === "active",
  };
  if (!(body instanceof FormData)) {
    return pb.collection(INV_COLLECTIONS.products).create({
      uom: "pcs",
      min_stock: 0,
      ...lifecycleFields,
      ...body,
    });
  }
  if (!body.has("uom")) body.append("uom", "pcs");
  if (!body.has("min_stock")) body.append("min_stock", "0");
  if (!body.has("product_type")) body.append("product_type", lifecycleFields.product_type);
  if (!body.has("lifecycle_status")) body.append("lifecycle_status", lifecycleFields.lifecycle_status);
  if (!body.has("is_active")) body.append("is_active", String(lifecycleFields.is_active));
  return pb.collection(INV_COLLECTIONS.products).create(body);
}

export function getProductImageUrl(product: InvProduct, thumb = "200x200") {
  return getCatalogProductImageUrl(product, "image", thumb);
}

export { getProductImageUrls };

export async function createMovementDraft(input: {
  movement_type: MovementType;
  warehouse: string;
  from_warehouse?: string;
  to_warehouse?: string;
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
  const json = (await res.json()) as {
    ok: boolean;
    data?: { id: string; movement_no?: string; status?: "posted" | "draft" };
    error?: string;
  };
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
  const parts: string[] = [];
  if (params?.warehouseId) parts.push(`warehouse = "${params.warehouseId}"`);
  if (params?.userId) parts.push(`user = "${params.userId}"`);
  const res = await pb.collection(INV_COLLECTIONS.staffActivities).getList(params?.page ?? 1, 40, {
    sort: "-occurred_at",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "user,zone,warehouse",
  });
  return res.items as unknown as InvStaffActivity[];
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

export async function fetchCategories(activeOnly = true) {
  const filter = activeOnly ? "is_active = true" : "";
  const res = await pb.collection(INV_COLLECTIONS.categories).getList(1, 200, {
    sort: "code",
    filter: filter || undefined,
  });
  return res.items as unknown as import("@/lib/inventory/types").InvCategory[];
}

export async function fetchBrands(activeOnly = true) {
  const filter = activeOnly ? "is_active = true" : "";
  const res = await pb.collection(INV_COLLECTIONS.brands).getList(1, 200, {
    sort: "code",
    filter: filter || undefined,
  });
  return res.items as unknown as import("@/lib/inventory/types").InvBrand[];
}

async function fetchWarehouseCodeById(warehouseId: string): Promise<string> {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne(warehouseId, {
    fields: "code",
    requestKey: null,
  });
  return String((wh as { code?: string }).code ?? "").trim();
}

export async function fetchWarehouseRooms(warehouseId: string) {
  const whCode = await fetchWarehouseCodeById(warehouseId);
  const list = await fetchLocations(warehouseId, true);
  const rooms = listWarehouseRooms(list, whCode);
  if (rooms.length > 0) return rooms;
  try {
    const { rooms: fromApi } = await fetchWarehouseSlotAssignments(warehouseId);
    return fromApi.length > 0 ? fromApi : rooms;
  } catch {
    return rooms;
  }
}

/** @deprecated Pakai fetchWarehouseRooms */
export async function fetchRackMasters(warehouseId: string) {
  return fetchWarehouseRooms(warehouseId);
}

export async function fetchWarehouseSlotAssignments(warehouseId: string) {
  const res = await fetch(
    `/api/inventory/locations/assignments?warehouse=${encodeURIComponent(warehouseId)}`,
    { credentials: "include" },
  );
  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    rooms?: import("@/lib/inventory/types").InvLocation[];
    slots?: import("@/lib/inventory/types").InvLocation[];
    byProductId?: Record<string, import("@/lib/inventory/types").InvLocation>;
    byRoomId?: Record<string, { id: string; sku: string; name: string }[]>;
  };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || "Gagal memuat penempatan slot");
  }
  const rooms = json.rooms ?? json.slots ?? [];
  return {
    rooms,
    slots: rooms,
    byProductId: json.byProductId ?? {},
    byRoomId: json.byRoomId ?? {},
  };
}

export async function saveWarehouseRoom(data: {
  id?: string;
  warehouse: string;
  code?: string;
  name?: string;
  productId?: string;
}) {
  try {
    const res = await fetch("/api/inventory/locations/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(60_000),
    });
    let json: { ok?: boolean; error?: string; record?: unknown };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      throw new Error("Gagal menyimpan slot (respons server tidak valid).");
    }
    if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menyimpan slot");
    return json.record;
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(
        "Simpan slot terlalu lama. Cek koneksi ke PocketBase, lalu coba lagi.",
      );
    }
    throw err;
  }
}

export async function fetchLocations(warehouseId?: string, activeOnly = true) {
  const parts: string[] = [];
  if (warehouseId) parts.push(`warehouse = "${warehouseId}"`);
  if (activeOnly) parts.push("is_active = true");
  const filter = parts.length ? parts.join(" && ") : undefined;
  try {
    return (await pb.collection(INV_COLLECTIONS.locations).getFullList({
      sort: "code",
      filter,
      expand: "warehouse",
      requestKey: null,
    })) as unknown as import("@/lib/inventory/types").InvLocation[];
  } catch {
    const res = await pb.collection(INV_COLLECTIONS.locations).getList(1, 500, {
      sort: "code",
      filter,
      expand: "warehouse",
      requestKey: null,
    });
    return res.items as unknown as import("@/lib/inventory/types").InvLocation[];
  }
}

export async function saveCategory(data: { id?: string; code: string; name: string }) {
  const payload = { code: data.code.trim().toUpperCase(), name: data.name.trim(), is_active: true };
  if (data.id) return pb.collection(INV_COLLECTIONS.categories).update(data.id, payload);
  return pb.collection(INV_COLLECTIONS.categories).create(payload);
}

export async function saveBrand(data: { id?: string; code: string; name: string }) {
  const payload = { code: data.code.trim().toUpperCase(), name: data.name.trim(), is_active: true };
  if (data.id) return pb.collection(INV_COLLECTIONS.brands).update(data.id, payload);
  return pb.collection(INV_COLLECTIONS.brands).create(payload);
}

async function locationApiJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; record?: T };
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Permintaan gagal (${res.status})`);
  }
  return json.record as T;
}

export async function saveLocation(data: LocationSaveInput) {
  const body = {
    warehouse: data.warehouse,
    code: data.code,
    name: data.name,
    zone_type: data.zone_type,
    aisle: data.aisle,
    level: data.level,
    bin: data.bin,
  };

  if (data.id) {
    const res = await fetch(`/api/inventory/locations/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return locationApiJson(res);
  }

  const res = await fetch("/api/inventory/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return locationApiJson(res);
}

export async function fetchProductsAtLocation(locationId: string) {
  const res = await pb.collection(INV_COLLECTIONS.products).getFullList({
    filter: `default_location = "${locationId.replace(/"/g, '\\"')}" && is_active = true`,
    fields: "id,sku,name,default_location",
    requestKey: null,
  });
  return res as unknown as import("@/lib/inventory/types").InvProduct[];
}

export async function setProductDefaultLocation(productId: string, locationId: string | null) {
  const product = await pb.collection(INV_COLLECTIONS.products).getOne(productId, {
    fields: "id,sku,name",
    requestKey: null,
  });
  return pb.collection(INV_COLLECTIONS.products).update(productId, {
    sku: product.sku,
    name: product.name,
    default_location: locationId,
  });
}

/** Nonaktifkan rak (disarankan — data tetap ada, tidak dipakai putaway). */
export async function deactivateLocation(id: string) {
  const res = await fetch(`/api/inventory/locations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deactivate: true }),
  });
  return locationApiJson(res);
}

/** Hapus permanen — hanya jika tidak ada produk yang memakai rak ini. */
export async function deleteLocation(id: string) {
  const res = await fetch(`/api/inventory/locations/${id}`, { method: "DELETE" });
  return locationApiJson(res);
}

export async function fetchPackingSessions(params?: { status?: string; page?: number }) {
  const parts: string[] = [];
  if (params?.status) parts.push(`status = "${params.status}"`);
  try {
    const res = await pb.collection(INV_COLLECTIONS.packingSessions).getList(params?.page ?? 1, 30, {
      sort: "-started_at",
      filter: parts.length ? parts.join(" && ") : undefined,
      expand: "warehouse,zone,packing_station,packed_by",
    });
    return res;
  } catch {
    try {
      return await pb.collection(INV_COLLECTIONS.packingSessions).getList(params?.page ?? 1, 30, {
        sort: "-created",
        filter: parts.length ? parts.join(" && ") : undefined,
      });
    } catch {
      return { page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] };
    }
  }
}

export async function fetchOpnameSessions(params?: { warehouseId?: string; page?: number }) {
  const parts: string[] = [];
  if (params?.warehouseId) parts.push(`warehouse = "${params.warehouseId}"`);
  const res = await pb.collection(INV_COLLECTIONS.opnameSessions).getList(params?.page ?? 1, 30, {
    sort: "-created",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "warehouse,started_by",
  });
  return res;
}

async function inventoryApiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: T };
  if (!res.ok || !json.ok) throw new Error(json.error || "Permintaan gagal.");
  return json.data as T;
}

export async function createPackingSessionApi(input: {
  packing_station_id: string;
  order_ref: string;
  lines: { product: string; expected_qty: number }[];
  notes?: string;
}) {
  return inventoryApiFetch<{ id: string }>("/api/inventory/packing/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function scanPackingSessionApi(sessionId: string, barcode: string) {
  return inventoryApiFetch<{ line: unknown; productName: string }>(
    `/api/inventory/packing/sessions/${sessionId}/scan`,
    { method: "POST", body: JSON.stringify({ barcode }) }
  );
}

export async function completePackingSessionApi(sessionId: string, postOut?: boolean) {
  return inventoryApiFetch<{ session: unknown }>(
    `/api/inventory/packing/sessions/${sessionId}/complete`,
    { method: "POST", body: JSON.stringify({ post_out: postOut }) }
  );
}

export async function createOpnameSessionApi(input: {
  warehouse: string;
  count_method: import("@/lib/inventory/types").OpnameCountMethod;
  notes?: string;
}) {
  return inventoryApiFetch<{ id: string; opname_no: string }>("/api/inventory/opname/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchOpnameDetailApi(sessionId: string) {
  return inventoryApiFetch<{ session: unknown; lines: unknown[] }>(
    `/api/inventory/opname/sessions/${sessionId}`
  );
}

export async function startOpnameCountingApi(sessionId: string) {
  return inventoryApiFetch<{ lineCount: number }>(
    `/api/inventory/opname/sessions/${sessionId}/start`,
    { method: "POST" }
  );
}

export async function submitOpnameLineApi(sessionId: string, lineId: string, countedQty: number) {
  return inventoryApiFetch<unknown>(`/api/inventory/opname/sessions/${sessionId}/count`, {
    method: "POST",
    body: JSON.stringify({ line_id: lineId, counted_qty: countedQty }),
  });
}

export async function submitOpnameReviewApi(sessionId: string) {
  return inventoryApiFetch<unknown>(`/api/inventory/opname/sessions/${sessionId}/submit-review`, {
    method: "POST",
  });
}

export async function approveOpnameApi(sessionId: string) {
  return inventoryApiFetch<unknown>(`/api/inventory/opname/sessions/${sessionId}/approve`, {
    method: "POST",
  });
}

export async function voidMovement(id: string, note?: string) {
  return inventoryApiFetch<{ reversal_id: string; movement_no: string }>(
    `/api/inventory/movements/${id}/void`,
    { method: "POST", body: JSON.stringify({ note }) }
  );
}

export async function postMovementWithCctv(id: string, cctvCameraId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) headers.Authorization = `Bearer ${pb.authStore.token}`;
  const res = await fetch(`/api/inventory/movements/${id}/post`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(cctvCameraId ? { cctv_camera_id: cctvCameraId } : {}),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; data?: { movement_no: string } };
  if (!res.ok || !json.ok) throw new Error(json.error || "Gagal posting movement.");
  return json.data!;
}

export async function fetchAuditLogs(params?: { warehouseId?: string; page?: number }) {
  const parts: string[] = [];
  if (params?.warehouseId) parts.push(`warehouse = "${params.warehouseId}"`);
  const res = await pb.collection(INV_COLLECTIONS.auditLog).getList(params?.page ?? 1, 40, {
    sort: "-occurred_at",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "user,warehouse",
  });
  return res.items as unknown as import("@/lib/inventory/types").InvAuditLog[];
}

export async function fetchCctvCameras(warehouseId?: string) {
  const filter = warehouseId ? `warehouse = "${warehouseId}" && is_active = true` : "is_active = true";
  const res = await pb.collection(INV_COLLECTIONS.cctvCameras).getList(1, 100, {
    sort: "code",
    filter,
    expand: "warehouse",
  });
  return res.items as unknown as import("@/lib/inventory/types").InvCctvCamera[];
}

export async function saveCctvCamera(data: {
  id?: string;
  warehouse: string;
  code: string;
  name: string;
  channel?: string;
  nvr_id?: string;
  location_label?: string;
  playback_hint_url?: string;
}) {
  const payload = {
    warehouse: data.warehouse,
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    channel: data.channel?.trim() || "",
    nvr_id: data.nvr_id?.trim() || "",
    location_label: data.location_label?.trim() || "",
    playback_hint_url: data.playback_hint_url?.trim() || "",
    is_active: true,
  };
  if (data.id) return pb.collection(INV_COLLECTIONS.cctvCameras).update(data.id, payload);
  return pb.collection(INV_COLLECTIONS.cctvCameras).create(payload);
}

export async function fetchMediaFiles(params?: { entityType?: string; page?: number }) {
  const parts: string[] = [];
  if (params?.entityType) parts.push(`entity_type = "${params.entityType}"`);
  const res = await pb.collection(INV_COLLECTIONS.mediaFiles).getList(params?.page ?? 1, 40, {
    sort: "-uploaded_at",
    filter: parts.length ? parts.join(" && ") : undefined,
    expand: "warehouse,uploaded_by",
  });
  return res.items as unknown as import("@/lib/inventory/types").InvMediaFile[];
}

export async function saveMediaFile(data: {
  storage_root: string;
  relative_path: string;
  original_filename?: string;
  mime_type: string;
  entity_type: string;
  entity_id: string;
  warehouse?: string;
  captured_at?: string;
}) {
  const userId = pb.authStore.model?.id;
  if (!userId) throw new Error("Login diperlukan.");
  const now = new Date().toISOString();
  return pb.collection(INV_COLLECTIONS.mediaFiles).create({
    storage_root: data.storage_root.trim(),
    relative_path: data.relative_path.trim(),
    original_filename: data.original_filename?.trim() || "",
    mime_type: data.mime_type.trim() || "image/jpeg",
    entity_type: data.entity_type,
    entity_id: data.entity_id.trim(),
    warehouse: data.warehouse || "",
    captured_at: data.captured_at || now,
    uploaded_at: now,
    uploaded_by: userId,
    is_verified: false,
  });
}

export async function fetchWarehouseAccess(userId?: string) {
  const filter = userId ? `user = "${userId}"` : "";
  const res = await pb.collection(INV_COLLECTIONS.userWarehouseAccess).getList(1, 200, {
    sort: "-created",
    filter: filter || undefined,
    expand: "user,warehouse",
  });
  return res.items as unknown as import("@/lib/inventory/types").InvUserWarehouseAccess[];
}

export async function saveWarehouseAccess(data: {
  user: string;
  warehouse: string;
  is_default?: boolean;
  can_count?: boolean;
  can_pack?: boolean;
  can_receive?: boolean;
  can_adjust?: boolean;
}) {
  return pb.collection(INV_COLLECTIONS.userWarehouseAccess).create({
    user: data.user,
    warehouse: data.warehouse,
    is_default: data.is_default ?? false,
    can_count: data.can_count ?? true,
    can_pack: data.can_pack ?? true,
    can_receive: data.can_receive ?? true,
    can_adjust: data.can_adjust ?? false,
  });
}

export async function deleteWarehouseAccess(id: string) {
  return pb.collection(INV_COLLECTIONS.userWarehouseAccess).delete(id);
}

export async function fetchProductBarcodes(productId: string) {
  const res = await pb.collection(INV_COLLECTIONS.productBarcodes).getList(1, 50, {
    filter: `product = "${productId}"`,
    sort: "-created",
  });
  return res.items as unknown as import("@/lib/inventory/types").InvProductBarcode[];
}

export async function saveProductBarcode(data: {
  product: string;
  barcode: string;
  barcode_type: string;
  is_primary?: boolean;
}) {
  return pb.collection(INV_COLLECTIONS.productBarcodes).create({
    product: data.product,
    barcode: data.barcode.trim(),
    barcode_type: data.barcode_type,
    is_primary: data.is_primary ?? false,
  });
}

export async function deleteProductBarcode(id: string) {
  return pb.collection(INV_COLLECTIONS.productBarcodes).delete(id);
}

export async function fetchProductPriceTiers(productId: string) {
  const res = await pb.collection(INV_COLLECTIONS.productPriceTiers).getFullList({
    filter: `product = "${productId}"`,
    sort: "store,min_qty",
    expand: "store",
  });
  return res as unknown as import("@/lib/inventory/types").InvProductPriceTier[];
}

export async function saveProductPriceTier(data: {
  id?: string;
  product: string;
  store: string;
  min_qty: number;
  max_qty?: number;
  price: number;
}) {
  const minQty = Math.max(1, data.min_qty);
  const maxQty = data.max_qty && data.max_qty >= minQty ? data.max_qty : minQty;
  const label = maxQty <= minQty ? String(minQty) : `${minQty}-${maxQty}`;
  const payload = {
    product: data.product,
    store: data.store,
    label,
    min_qty: minQty,
    max_qty: maxQty,
    price: data.price,
    is_active: true,
  };
  if (data.id) return pb.collection(INV_COLLECTIONS.productPriceTiers).update(data.id, payload);
  return pb.collection(INV_COLLECTIONS.productPriceTiers).create(payload);
}

export async function deleteProductPriceTier(id: string) {
  return pb.collection(INV_COLLECTIONS.productPriceTiers).delete(id);
}

export async function updateProductBuyPrice(productId: string, newBuyPrice: number) {
  return pb.collection(INV_COLLECTIONS.products).update(productId, { buy_price: newBuyPrice });
}
