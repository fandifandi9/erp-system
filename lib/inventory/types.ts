export type InventoryRole = "none" | "staff" | "supervisor" | "admin";

export type MovementType =
  | "IN"
  | "OUT"
  | "TRANSFER"
  | "RETURN"
  | "DAMAGE"
  | "ADJUSTMENT";

export type MovementStatus = "draft" | "posted" | "void" | "cancelled";

export type ZoneType =
  | "receiving"
  | "packing"
  | "qc"
  | "return"
  | "rack"
  | "shipping"
  | "counting";

export type ZoneSessionStatus = "active" | "closed" | "expired" | "forced_closed";

export type StaffActivityType =
  | "zone_checkin"
  | "zone_checkout"
  | "scan_zone_qr"
  | "scan_product"
  | "scan_location"
  | "movement_create_draft"
  | "movement_post_request";

export type InvWarehouse = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

export type InvProduct = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  uom?: string;
  min_stock?: number;
  is_active?: boolean;
  category?: string;
  brand?: string;
  default_location?: string;
};

export type InvLocation = {
  id: string;
  code: string;
  name?: string;
  warehouse: string;
  zone_type?: string;
  is_active?: boolean;
};

export type InvStockBalance = {
  id: string;
  warehouse: string;
  location?: string;
  product: string;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  version?: number;
  expand?: {
    product?: InvProduct;
    warehouse?: InvWarehouse;
    location?: InvLocation;
  };
};

export type InvMovementLine = {
  id: string;
  movement: string;
  product: string;
  qty: number;
  unit_cost?: number;
  expand?: { product?: InvProduct };
};

export type InvMovement = {
  id: string;
  movement_no: string;
  movement_type: MovementType;
  status: MovementStatus;
  warehouse: string;
  from_warehouse?: string;
  to_warehouse?: string;
  from_location?: string;
  to_location?: string;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  posted_at?: string;
  posted_by?: string;
  created_by: string;
  created: string;
  total_qty?: number;
  line_count?: number;
  expand?: {
    warehouse?: InvWarehouse;
    created_by?: { id: string; email?: string; name?: string };
    posted_by?: { id: string; email?: string };
  };
};

export type InvZone = {
  id: string;
  warehouse: string;
  code: string;
  name: string;
  zone_type: ZoneType;
  qr_payload: string;
  qr_version?: number;
  requires_station?: boolean;
  sort_order?: number;
  is_active?: boolean;
  expand?: { warehouse?: InvWarehouse };
};

export type InvZoneSession = {
  id: string;
  user: string;
  warehouse: string;
  zone: string;
  packing_station?: string;
  status: ZoneSessionStatus;
  check_in_at: string;
  check_out_at?: string;
  device_platform?: string;
  activity_summary?: string;
  closed_reason?: string;
  expand?: {
    zone?: InvZone;
    warehouse?: InvWarehouse;
    user?: { id: string; email?: string; name?: string };
  };
};

export type InvStaffActivity = {
  id: string;
  user: string;
  warehouse: string;
  zone?: string;
  zone_session?: string;
  activity_type: StaffActivityType | string;
  entity_type?: string;
  entity_id?: string;
  payload?: Record<string, unknown>;
  occurred_at: string;
  device_platform?: string;
  expand?: {
    user?: { id: string; email?: string; name?: string };
    zone?: InvZone;
    warehouse?: InvWarehouse;
  };
};

export type ZoneQrPrintMeta = {
  payload: string;
  zoneCode: string;
  zoneName: string;
  warehouseCode?: string;
  warehouseName?: string;
  zoneType?: string;
};

export const INV_COLLECTIONS = {
  warehouses: "inv_warehouses",
  products: "inv_products",
  locations: "inv_locations",
  balances: "inv_stock_balances",
  movements: "inv_stock_movements",
  movementLines: "inv_stock_movement_lines",
  auditLog: "inv_audit_log",
  zones: "inv_zones",
  zoneSessions: "inv_zone_sessions",
  staffActivities: "inv_staff_activities",
} as const;

export const ZONE_TYPES: { value: ZoneType; label: string }[] = [
  { value: "receiving", label: "Receiving" },
  { value: "packing", label: "Packing" },
  { value: "qc", label: "QC" },
  { value: "return", label: "Return" },
  { value: "rack", label: "Rak" },
  { value: "shipping", label: "Shipping" },
  { value: "counting", label: "Opname" },
];
