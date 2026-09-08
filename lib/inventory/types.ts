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
  | "movement_post_request"
  | "packing_scan"
  | "packing_complete"
  | "opname_count";

export type PackingSessionStatus = "open" | "in_progress" | "completed" | "cancelled";

export type OpnameSessionStatus =
  | "draft"
  | "counting"
  | "review"
  | "approved"
  | "posted"
  | "cancelled";

export type OpnameCountMethod = "full" | "cycle" | "spot";

export type OpnameLineStatus = "pending" | "counted" | "recount" | "skipped";

export type InvCategory = {
  id: string;
  code: string;
  name: string;
  parent?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type InvBrand = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

export type InvCctvCamera = {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  nvr_id?: string;
  channel?: string;
  location_label?: string;
  playback_hint_url?: string;
  is_active?: boolean;
  expand?: { warehouse?: InvWarehouse };
};

export type CctvSnapshot = {
  camera: string;
  camera_code?: string;
  channel?: string;
  event_at: string;
  playback_hint_url?: string;
  offset_sec_before?: number;
  offset_sec_after?: number;
};

export type InvMediaFile = {
  id: string;
  storage_root: string;
  relative_path: string;
  original_filename?: string;
  mime_type: string;
  size_bytes?: number;
  captured_at: string;
  uploaded_at: string;
  uploaded_by: string;
  entity_type: string;
  entity_id: string;
  warehouse?: string;
  is_verified?: boolean;
  expand?: {
    warehouse?: InvWarehouse;
    uploaded_by?: { id: string; email?: string; name?: string };
  };
};

export type InvAuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user: string;
  warehouse?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  occurred_at: string;
  expand?: {
    user?: { id: string; email?: string; name?: string };
    warehouse?: InvWarehouse;
  };
};

export type InvUserWarehouseAccess = {
  id: string;
  user: string;
  warehouse: string;
  is_default?: boolean;
  can_count?: boolean;
  can_pack?: boolean;
  can_receive?: boolean;
  can_adjust?: boolean;
  expand?: {
    user?: { id: string; email?: string; name?: string };
    warehouse?: InvWarehouse;
  };
};

export type InvProductBarcode = {
  id: string;
  product: string;
  barcode: string;
  barcode_type: string;
  is_primary?: boolean;
};

export type InvPackingStation = {
  id: string;
  zone: string;
  warehouse: string;
  code: string;
  name?: string;
  qr_payload?: string;
  is_active?: boolean;
  expand?: { zone?: InvZone; warehouse?: InvWarehouse };
};

export type InvPackingChecklistLine = {
  id: string;
  packing_session: string;
  product: string;
  sku_snapshot?: string;
  expected_qty: number;
  scanned_qty: number;
  is_complete?: boolean;
  last_scanned_at?: string;
  expand?: { product?: InvProduct };
};

export type InvPackingSession = {
  id: string;
  warehouse: string;
  zone: string;
  zone_session: string;
  packing_station: string;
  order_ref: string;
  order_source?: string;
  status: PackingSessionStatus;
  started_at: string;
  completed_at?: string;
  packed_by: string;
  movement?: string;
  notes?: string;
  expand?: {
    warehouse?: InvWarehouse;
    zone?: InvZone;
    packing_station?: InvPackingStation;
    packed_by?: { id: string; email?: string; name?: string };
  };
};

export type InvOpnameSession = {
  id: string;
  warehouse: string;
  opname_no: string;
  status: OpnameSessionStatus;
  count_method: OpnameCountMethod;
  started_by: string;
  approved_by?: string;
  posted_by?: string;
  count_started_at?: string;
  count_ended_at?: string;
  approved_at?: string;
  posted_at?: string;
  notes?: string;
  movement?: string;
  total_lines?: number;
  total_variance_qty?: number;
  expand?: {
    warehouse?: InvWarehouse;
    started_by?: { id: string; email?: string; name?: string };
  };
};

export type InvOpnameLine = {
  id: string;
  session: string;
  product: string;
  location?: string;
  system_qty: number;
  counted_qty?: number;
  variance_qty?: number;
  line_status: OpnameLineStatus | string;
  scanned_at?: string;
  notes?: string;
  expand?: {
    product?: InvProduct;
    location?: InvLocation;
  };
};

export type InvWarehouse = {
  id: string;
  code: string;
  name: string;
  company?: string;
  store?: string;
  warehouse_role?: string;
  is_active?: boolean;
};

export type InvProductPriceTier = {
  id: string;
  product: string;
  store?: string;
  label?: string;
  min_qty: number;
  max_qty?: number;
  price: number;
  is_active?: boolean;
  expand?: { store?: { id: string; name: string; code?: string } };
};

export type InvProduct = {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  uom?: string;
  min_stock?: number;
  sell_price?: number;
  buy_price?: number;
  image?: string;
  image_2?: string;
  image_3?: string;
  is_active?: boolean;
  /** simple | bundle — bundle fase 2 */
  product_type?: "simple" | "bundle";
  /** draft | active | inactive — master katalog */
  lifecycle_status?: "draft" | "active" | "inactive";
  commercial_ready_at?: string;
  commercial_ready_by?: string;
  created_by_role?: string;
  /** Perubahan identitas/harga katalog — bukan pergerakan stok. */
  catalog_updated_at?: string;
  /** Wajib input serial number saat picking / fulfillment. */
  requires_serial?: boolean;
  category?: string;
  brand?: string;
  /** @deprecated Pakai inv_product_placements per gudang */
  default_location?: string;
  collectionId?: string;
  created?: string;
  updated?: string;
  expand?: {
    category?: { id: string; name: string };
    brand?: { id: string; name: string };
  };
};

/** Penempatan produk per gudang (multi-gudang — tidak menimpa gudang lain). */
export type InvProductPlacement = {
  id: string;
  product: string;
  warehouse: string;
  location: string;
  is_active?: boolean;
  expand?: {
    product?: Pick<InvProduct, "id" | "sku" | "name">;
    warehouse?: InvWarehouse;
    location?: InvLocation;
  };
};

export type InvLocation = {
  id: string;
  code: string;
  name?: string;
  warehouse: string;
  zone_type?: string;
  aisle?: string;
  level?: string;
  bin?: string;
  /** Produk khusus slot ini (per gudang). */
  assigned_product?: string;
  is_active?: boolean;
  expand?: {
    warehouse?: InvWarehouse;
    assigned_product?: Pick<InvProduct, "id" | "sku" | "name" | "barcode">;
  };
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
  cctv_snapshot?: CctvSnapshot | Record<string, unknown>;
  parent_movement?: string;
  cancelled_at?: string;
  cancelled_by?: string;
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
  categories: "inv_categories",
  brands: "inv_brands",
  products: "inv_products",
  productBarcodes: "inv_product_barcodes",
  productPriceTiers: "inv_product_price_tiers",
  locations: "inv_locations",
  productPlacements: "inv_product_placements",
  productBundleLines: "inv_product_bundle_lines",
  balances: "inv_stock_balances",
  movements: "inv_stock_movements",
  movementLines: "inv_stock_movement_lines",
  auditLog: "inv_audit_log",
  zones: "inv_zones",
  zoneSessions: "inv_zone_sessions",
  staffActivities: "inv_staff_activities",
  packingStations: "inv_packing_stations",
  packingSessions: "inv_packing_sessions",
  packingChecklistLines: "inv_packing_checklist_lines",
  opnameSessions: "inv_stock_opname_sessions",
  opnameLines: "inv_stock_opname_lines",
  opnameAdjustments: "inv_stock_opname_adjustments",
  cctvCameras: "inv_cctv_cameras",
  mediaFiles: "inv_media_files",
  userWarehouseAccess: "inv_user_warehouse_access",
} as const;

export const BARCODE_TYPES: { value: string; label: string }[] = [
  { value: "ean13", label: "EAN-13" },
  { value: "ean8", label: "EAN-8" },
  { value: "upc", label: "UPC-A (12 digit)" },
  { value: "itf", label: "ITF (Interleaved 2 of 5)" },
  { value: "code128", label: "Code 128" },
  { value: "qr", label: "QR" },
  { value: "internal", label: "Kode internal" },
];

export const MEDIA_ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "movement", label: "Mutasi stok" },
  { value: "packing", label: "Kemasan" },
  { value: "opname", label: "Opname stok" },
  { value: "receiving", label: "Penerimaan" },
  { value: "damage", label: "Kerusakan" },
];

export const LOCATION_ZONE_TYPES: { value: string; label: string }[] = [
  { value: "rack", label: "Rak" },
  { value: "staging", label: "Antrian" },
  { value: "quarantine", label: "Karantina" },
  { value: "bulk", label: "Massal" },
  { value: "pick_face", label: "Area ambil" },
];

export const OPNAME_COUNT_METHODS: { value: OpnameCountMethod; label: string }[] = [
  { value: "full", label: "Seluruh gudang" },
  { value: "cycle", label: "Hitung siklus" },
  { value: "spot", label: "Pengecekan spot" },
];

export const ZONE_TYPES: { value: ZoneType; label: string }[] = [
  { value: "receiving", label: "Penerimaan" },
  { value: "packing", label: "Kemasan" },
  { value: "qc", label: "QC" },
  { value: "return", label: "Retur" },
  { value: "rack", label: "Rak" },
  { value: "shipping", label: "Pengiriman" },
  { value: "counting", label: "Opname" },
];
