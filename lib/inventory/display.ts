import type { InvStaffActivity, InvWarehouse, InvZone } from "@/lib/inventory/types";

type UserExpand = { id?: string; name?: string; email?: string };

export function formatStaffDisplayName(user?: UserExpand | null, fallbackId?: string): string {
  const name = (user?.name || "").trim();
  if (name) return name;
  const email = (user?.email || "").trim();
  if (email) return email;
  return fallbackId || "—";
}

export function formatWarehouseLabel(
  warehouse?: InvWarehouse | null,
  warehouseId?: string,
  whById?: Record<string, InvWarehouse>
): string {
  const w = warehouse || (warehouseId && whById?.[warehouseId]);
  if (!w) return warehouseId ? `Gudang ${warehouseId.slice(0, 8)}…` : "—";
  const code = (w.code || "").trim();
  const name = (w.name || "").trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || "—";
}

export function formatZoneLabel(
  zone?: InvZone | null,
  zoneId?: string,
  zoneById?: Record<string, InvZone>
): string {
  const z = zone || (zoneId && zoneById?.[zoneId]);
  if (!z) return zoneId ? `Zona ${zoneId.slice(0, 8)}…` : "—";
  const code = (z.code || "").trim();
  const name = (z.name || "").trim();
  const type = (z.zone_type || "").trim();
  if (name && code) {
    return type ? `${name} (${code}) · ${type}` : `${name} (${code})`;
  }
  return code || name || "—";
}

export function enrichStaffActivities(
  items: InvStaffActivity[],
  whById: Record<string, InvWarehouse>,
  zoneById: Record<string, InvZone>
): InvStaffActivity[] {
  return items.map((a) => ({
    ...a,
    expand: {
      ...a.expand,
      warehouse:
        a.expand?.warehouse ||
        (a.warehouse ? whById[a.warehouse] : undefined),
      zone: a.expand?.zone || (a.zone ? zoneById[a.zone] : undefined),
    },
  }));
}
