export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

/** Channel bisnis — B2C/B2B (bukan label platform MP). */
export type BusinessChannel = "b2c" | "b2b";

/** Mode penjualan — online/offline. */
export type SaleMode = "online" | "offline";

export type PaymentMethod = string;

export type PaymentMethodSetting = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created: string;
  updated: string;
};

export type Courier = {
  id: string;
  code?: string;
  name: string;
  logo?: string;
  is_active: boolean;
  notes?: string;
  collectionId?: string;
  collectionName?: string;
  created: string;
  updated: string;
};

export type CourierService = {
  id: string;
  courier: string;
  code?: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created: string;
  updated: string;
  expand?: { courier?: Courier };
};

export type InvoiceStatus =
  | "unpaid"
  | "paid"
  | "overdue"
  | "cancelled"
  /** @deprecated legacy */
  | "draft"
  | "sent";

export type ReturType = "penjualan" | "pembelian";
export type ReturStatus = "draft" | "approved" | "completed" | "cancelled";

export type ReturWorkflowPhase =
  | "awaiting_wms"
  | "wms_received"
  | "awaiting_business"
  | "awaiting_settlement"
  | "resend"
  | "completed"
  | "cancelled";

/** Expected vs Actual — exception pada transaksi (retur, penerimaan, dll.). */
export type TransactionExceptionStatus = "none" | "open" | "resolved";

export type PurchaseOrderStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial_received"
  | "received"
  | "cancelled";

/** Status proses fisik di gudang (terpisah dari status PO bisnis). */
export type WarehouseProcessStatus =
  | "pending"
  | "checking"
  | "hold"
  | "processing"
  | "complete";

export type WarehouseProcessMode = "direct" | "hold";

export type CustomerType = "member" | "regular";

export type Customer = {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  credit_limit?: number;
  outstanding_balance?: number;
  customer_type?: CustomerType;
  is_active: boolean;
  created: string;
  updated: string;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  contact_person?: string;
  bank_name?: string;
  bank_account?: string;
  tax_id?: string;
  notes?: string;
  is_active: boolean;
  created: string;
  updated: string;
};

export type SalesOrder = {
  id: string;
  order_no: string;
  customer: string;
  /** Entitas pemilik transaksi — denormalized untuk laporan & filter. */
  company?: string;
  /** Toko penjualan (branding & laporan). */
  store?: string;
  /** B2C / B2B — channel bisnis, bukan platform MP. */
  business_channel?: BusinessChannel;
  /** Online / offline. */
  sale_mode?: SaleMode;
  /** Label platform pencatatan: Shopee, Tokopedia, POS, dll. */
  platform_source?: string;
  warehouse: string;
  status: SalesOrderStatus;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  order_date: string;
  due_date?: string;
  shipped_date?: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  materai_amount?: number;
  total: number;
  notes?: string;
  created_by: string;
  approved_by?: string;
  /** Kirim ke gudang — antrean picking */
  send_to_warehouse_at?: string;
  warehouse_process_status?: WarehouseProcessStatus;
  warehouse_processed_by?: string;
  warehouse_processed_at?: string;
  warehouse_hold_note?: string;
  /** Alur keluar: picking → validasi → packing → pickup (JSON). */
  outbound_workflow_json?: string;
  /** Nomor booking + QR untuk pengeluaran. */
  wms_booking_no?: string;
  /** Nomor picking kit (00001, 5 digit) — identitas utama scan gudang. */
  pk_no?: string;
  /** File label AWB (PDF/gambar) dari MP/kurir — untuk cetak di gudang. */
  awb_label?: string;
  /** Kapan label AWB siap cetak (ISO). */
  awb_ready_at?: string;
  /** Sumber upload: manual | excel | zip_import | wms_pickup */
  awb_source?: string;
  created: string;
  updated: string;
  expand?: {
    customer?: Customer;
    store?: Store;
    warehouse?: { id: string; code: string; name: string };
    created_by?: { id: string; name?: string; email?: string };
    warehouse_processed_by?: { id: string; name?: string; email?: string };
  };
};

export type SalesOrderLine = {
  id: string;
  sales_order: string;
  product: string;
  sku_snapshot?: string;
  name_snapshot?: string;
  qty: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  tax_percent: number;
  line_total: number;
  /** SN unit terikat baris — JSON array string. */
  serial_numbers_json?: string;
  expand?: {
    product?: { id: string; sku: string; name: string };
  };
};

export type InvoiceSource = "manual" | "marketplace_import";

export type Invoice = {
  id: string;
  invoice_no: string;
  sales_order?: string;
  customer: string;
  /** Entitas pemilik transaksi — denormalized untuk laporan & filter. */
  company?: string;
  /** Toko penjualan — header dokumen pelanggan. */
  store?: string;
  /** Snapshot identitas toko + company saat posting. */
  identity_snapshot_json?: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  materai_amount?: number;
  total: number;
  paid_amount: number;
  remaining: number;
  is_cash?: boolean;
  cancel_reason?: string;
  notes?: string;
  /** Penjualan online / MP */
  source?: InvoiceSource;
  mp_order_no?: string;
  /** Nama penerima / pembeli dari export MP (bukan customer ERP). */
  mp_buyer_name?: string;
  /** @deprecated Gunakan platform_source — relasi ke biz_sales_channels (label MP). */
  sales_channel?: string;
  business_channel?: BusinessChannel;
  sale_mode?: SaleMode;
  platform_source?: string;
  store_channel_account?: string;
  expected_net?: number;
  mp_fees_json?: string;
  /** Token acak untuk URL publik /share/i/[token] */
  share_token?: string;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    customer?: Customer;
    store?: Store;
    sales_order?: SalesOrder;
    sales_channel?: SalesChannel;
    store_channel_account?: StoreChannelAccount;
  };
};

/** Ringkas info MP untuk tampilan nota (bukan customer master). */
export type MarketplaceInvoiceMeta = {
  channelName: string;
  accountName: string;
  mpOrderNo: string;
  mpBuyerName?: string;
};

// ─── Penjualan Online / Marketplace ───

export type MpFeeType =
  | "category_fee"
  | "free_shipping"
  | "cashback"
  | "mall_fee"
  | "processing"
  | "affiliate";

export type MpFeeCalcType = "percent" | "percent_cap" | "fixed" | "fixed_per_qty";

export type MpFeeAppliesTo = "line" | "order";

export type SalesChannel = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
};

export type MpSellerTier = {
  id: string;
  channel: string;
  code: string;
  label: string;
  sort_order?: number;
  is_active: boolean;
  created: string;
  updated: string;
  expand?: { channel?: SalesChannel };
};

export type StoreChannelAccount = {
  id: string;
  store: string;
  channel: string;
  seller_tier: string;
  account_name: string;
  mp_shop_id?: string;
  default_customer?: string;
  is_active: boolean;
  notes?: string;
  default_fee_template?: string;
  created: string;
  updated: string;
  expand?: {
    store?: Store;
    channel?: SalesChannel;
    seller_tier?: MpSellerTier;
    default_customer?: Customer;
    default_fee_template?: MpFeeTemplate;
  };
};

export type MpFeeRule = {
  id: string;
  fee_type: MpFeeType;
  channel?: string;
  store?: string;
  store_channel_account?: string;
  seller_tier?: string;
  mp_category?: string;
  internal_category?: string;
  scope_product?: string;
  calc_type: MpFeeCalcType;
  rate?: number;
  max_amount?: number;
  fixed_amount?: number;
  applies_to: MpFeeAppliesTo;
  valid_from?: string;
  valid_to?: string;
  priority: number;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
};

export type MpTemplateLineGroup = "mp_fee" | "operational" | "category" | "product";

export type MpFeeTemplate = {
  id: string;
  code: string;
  name: string;
  channel?: string;
  seller_tier?: string;
  store_channel_account?: string;
  notes?: string;
  sort_order?: number;
  is_active: boolean;
  created: string;
  updated: string;
  expand?: {
    channel?: SalesChannel;
    seller_tier?: MpSellerTier;
    store_channel_account?: StoreChannelAccount;
  };
};

export type MpFeeTemplateLine = {
  id: string;
  template: string;
  label: string;
  code: string;
  line_group: MpTemplateLineGroup;
  calc_type: MpFeeCalcType;
  rate?: number;
  max_amount?: number;
  fixed_amount?: number;
  applies_to: MpFeeAppliesTo;
  internal_category?: string;
  scope_product?: string;
  sort_order?: number;
  is_active: boolean;
  is_default?: boolean;
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    internal_category?: { id: string; name: string };
    scope_product?: { id: string; sku: string; name: string };
  };
};

// ─── Fee Engine per SKU (channel + tier + SKU) ───

/** Tipe hitung fee SKU. `inherit` (khusus affiliate di baris SKU) = ikut default tier. */
export type MpSkuCalcType = "percent" | "percent_cap" | "fixed";
export type MpSkuAffCalcType = "inherit" | "none" | MpSkuCalcType;

export type MpTierDefault = {
  id: string;
  channel: string;
  seller_tier: string;
  mp_calc_type: MpSkuCalcType;
  mp_rate?: number;
  mp_max_amount?: number;
  mp_fixed_amount?: number;
  aff_calc_type: "none" | MpSkuCalcType;
  aff_rate?: number;
  aff_max_amount?: number;
  aff_fixed_amount?: number;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
  expand?: { channel?: SalesChannel; seller_tier?: MpSellerTier };
};

export type MpProductFee = {
  id: string;
  channel: string;
  seller_tier: string;
  product: string;
  mp_calc_type: MpSkuCalcType;
  mp_rate?: number;
  mp_max_amount?: number;
  mp_fixed_amount?: number;
  aff_calc_type: MpSkuAffCalcType;
  aff_rate?: number;
  aff_max_amount?: number;
  aff_fixed_amount?: number;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
  expand?: {
    channel?: SalesChannel;
    seller_tier?: MpSellerTier;
    product?: { id: string; sku: string; name: string };
  };
};

/** Tag bantu: hanya untuk filter & bulk update fee, tidak ikut hitung. */
export type ProductTag = {
  id: string;
  name: string;
  products?: string[];
  notes?: string;
  is_active: boolean;
  created: string;
  updated: string;
};

export type MpProductMapping = {
  id: string;
  store_channel_account?: string;
  channel?: string;
  mp_sku: string;
  mp_product_name?: string;
  product: string;
  is_active: boolean;
  created: string;
  updated: string;
  expand?: { product?: { id: string; sku: string; name: string } };
};

export type SalesImportBatchStatus = "draft" | "validated" | "posted" | "cancelled";

export type SalesImportBatch = {
  id: string;
  batch_no: string;
  store_channel_account: string;
  period_from?: string;
  period_to?: string;
  status: SalesImportBatchStatus;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  posted_rows: number;
  source_filename?: string;
  fee_template?: string;
  notes?: string;
  created_by: string;
  posted_at?: string;
  created: string;
  updated: string;
  expand?: {
    store_channel_account?: StoreChannelAccount;
    fee_template?: MpFeeTemplate;
  };
};

export type SalesImportLineStatus = "pending" | "valid" | "error" | "posted" | "skipped";

export type PaymentImportBatchStatus = "draft" | "validated" | "posted" | "cancelled";

export type PaymentImportBatch = {
  id: string;
  batch_no: string;
  status: PaymentImportBatchStatus;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  posted_rows: number;
  source_filename?: string;
  notes?: string;
  created_by: string;
  posted_at?: string;
  created: string;
  updated: string;
};

export type PaymentImportLineStatus = "pending" | "valid" | "error" | "posted" | "skipped";

export type PaymentImportLine = {
  id: string;
  batch: string;
  row_no: number;
  invoice_no: string;
  invoice?: string;
  payment_date: string;
  amount: number;
  payment_method_label?: string;
  payment_method?: string;
  reference_no?: string;
  notes?: string;
  lunas_penuh?: boolean;
  validation_status: PaymentImportLineStatus;
  error_message?: string;
  payment?: string;
  created: string;
  updated: string;
  expand?: {
    invoice?: Invoice & { expand?: { customer?: Customer } };
    payment?: { id: string };
  };
};

export type SalesImportLine = {
  id: string;
  batch: string;
  row_no: number;
  mp_order_no: string;
  order_date: string;
  mp_buyer_name?: string;
  mp_sku: string;
  product_name?: string;
  mp_category?: string;
  qty: number;
  unit_price: number;
  gross_amount: number;
  product?: string;
  fee_category: number;
  fee_free_shipping: number;
  fee_cashback: number;
  fee_mall: number;
  fee_processing: number;
  fee_affiliate: number;
  total_fees: number;
  expected_net: number;
  fee_override_json?: string;
  fee_template_snapshot?: string;
  validation_status: SalesImportLineStatus;
  error_message?: string;
  invoice?: string;
  created: string;
  updated: string;
  expand?: {
    product?: { id: string; sku: string; name: string; category?: string; expand?: { category?: { id: string; name: string } } };
    invoice?: Invoice;
  };
};

export type PurchaseOrder = {
  id: string;
  po_no: string;
  supplier: string;
  /** Entitas pemilik transaksi — denormalized untuk laporan & filter. */
  company?: string;
  warehouse: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date?: string;
  subtotal: number;
  /** Diskon header (di luar diskon per baris). */
  discount_amount?: number;
  tax_amount: number;
  materai_amount?: number;
  total: number;
  notes?: string;
  created_by: string;
  approved_by?: string;
  /** Kirim ke gudang — antrean penerimaan */
  send_to_warehouse_at?: string;
  warehouse_process_status?: WarehouseProcessStatus;
  warehouse_received_at?: string;
  warehouse_processed_by?: string;
  warehouse_processed_at?: string;
  warehouse_process_mode?: WarehouseProcessMode;
  warehouse_hold_note?: string;
  receiving_warehouse?: string;
  surat_jalan_no?: string;
  surat_jalan_verified?: boolean;
  /** JSON: QC / label per baris PO (lihat lib/wms/receiving-workflow.ts) */
  receiving_workflow_json?: string;
  /** Foto dokumen penerimaan (surat jalan, kondisi barang, dll.) — opsional */
  receiving_photos?: string | string[];
  /** Setelah WMS komplit: menunggu keputusan pembeli sebelum bill final. */
  receiving_business_status?: "pending_wms" | "awaiting_business" | "resolved";
  receiving_discrepancy?: boolean;
  /** QC / penerimaan: none = auto-path; open = butuh bisnis. */
  exception_status?: TransactionExceptionStatus;
  /** Kapan penerimaan normal selesai otomatis (tanpa approval bisnis). */
  receiving_auto_proceeded_at?: string;
  /** Ringkasan selisih QC (JSON) saat exception. */
  qc_exception_summary?: string;
  unboxing_video_path?: string;
  reminder_due_at?: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: Supplier;
    company?: { id: string; company_name: string; code?: string };
    warehouse?: { id: string; code: string; name: string };
    created_by?: { id: string; name?: string; email?: string };
    warehouse_processed_by?: { id: string; name?: string; email?: string };
    receiving_warehouse?: { id: string; code: string; name: string };
  };
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order: string;
  product: string;
  qty: number;
  received_qty: number;
  unit_cost: number;
  line_total: number;
  expand?: {
    product?: { id: string; sku: string; name: string };
  };
};

export type ReturLineCondition = "good" | "damaged";

export type WmsReceiveStatus = "pending" | "checking" | "complete";

export type ReturLine = {
  id: string;
  retur: string;
  product: string;
  qty: number;
  unit_price?: number;
  line_total?: number;
  reason?: string;
  condition?: ReturLineCondition;
  /** Intent bisnis saat buat retur (fase berikutnya). */
  expected_condition?: ReturLineCondition;
  expected_warehouse?: string;
  actual_qty?: number;
  actual_condition?: ReturLineCondition;
  sales_order_line?: string;
  purchase_order_line?: string;
  expand?: {
    product?: { id: string; sku: string; name: string };
    retur?: Retur;
  };
};

export type Retur = {
  id: string;
  retur_no: string;
  type: ReturType;
  status: ReturStatus;
  reference_id?: string;
  sales_order?: string;
  invoice?: string;
  purchase_order?: string;
  purchase_bill?: string;
  wms_receive_status?: WmsReceiveStatus;
  wms_received_at?: string;
  workflow_phase?: ReturWorkflowPhase;
  unboxing_video_path?: string;
  reminder_due_at?: string;
  customer?: string;
  supplier?: string;
  warehouse: string;
  damaged_warehouse?: string;
  reason?: string;
  /** Catatan claim / internal bisnis (bukan instruksi gudang). */
  notes?: string;
  /** Instruksi bisnis khusus untuk tim WMS. */
  notes_for_wms?: string;
  /** Catatan hasil pemeriksaan dari WMS. */
  wms_note?: string;
  /**
   * Nomor retur dari platform/marketplace — ditampilkan sebagai nomor utama untuk WMS/bisnis
   * (menggantikan tampilan RET sistem jika diisi). Sistem tetap menyimpan retur_no internal.
   */
  platform_retur_no?: string;
  /** Keputusan WMS terhadap claim/instruksi bisnis. */
  wms_claim_decision?: "agree" | "disagree";
  /** Sanggahan WMS jika tidak setuju claim bisnis. */
  wms_dispute_note?: string;
  /** Putusan bisnis setelah bantahan WMS: terima klarifikasi atau kirim kembali. */
  business_resolution?: "accept_wms" | "resend" | "";
  /** Nomor pickup untuk kirim kembali ke pelanggan. */
  resend_pickup_no?: string;
  /** Cara serah terima kirim kembali: ambil sendiri atau kurir. */
  resend_method?: "pickup" | "ship" | "";
  /** JSON: ekspedisi, layanan, alamat, ongkir, penanggung ongkir (mode ship). */
  resend_shipping_json?: string;
  /** Audit proses WMS. */
  wms_process_started_at?: string;
  wms_process_completed_at?: string;
  wms_processed_by?: string;
  /** Nama tampilan prosesor WMS (denormalized). */
  wms_processed_by_name?: string;
  /** Audit proses bisnis. */
  business_process_started_at?: string;
  business_process_completed_at?: string;
  business_processed_by?: string;
  /** Nama tampilan prosesor bisnis (denormalized). */
  business_processed_by_name?: string;
  mp_claim_amount?: number;
  shipping_reimb_amount?: number;
  settlement_estimate_json?: string;
  /** Cara barang dikembalikan ke gudang. */
  return_method?: "dropoff" | "courier";
  /** Nama ekspedisi retur (jika via kurir). */
  return_courier?: string;
  /** Nomor resi / nomor lacak retur. */
  return_tracking_no?: string;
  completed_at?: string;
  exception_status?: TransactionExceptionStatus;
  stock_posted_at?: string;
  wms_exception_summary?: string;
  settled_at?: string;
  total: number;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    customer?: Customer;
    supplier?: Supplier;
    warehouse?: { id: string; code: string; name: string };
    damaged_warehouse?: { id: string; code: string; name: string };
    sales_order?: SalesOrder;
    invoice?: Invoice;
    created_by?: { id: string; name?: string; email?: string };
  };
};

export type ProductPrice = {
  id: string;
  product: string;
  /** Kosong = harga tier global (legacy); terisi = harga khusus toko. */
  store?: string;
  price_level: string;
  sell_price: number;
  min_qty?: number;
  customer_group?: string;
  valid_from?: string;
  valid_to?: string;
  is_active: boolean;
  expand?: {
    store?: Store;
    product?: { id: string; sku: string; name: string };
  };
};

// ─── Biaya / Expenses (Jurnal.id style) ───

export type ExpenseCategory =
  | "operasional"
  | "gaji"
  | "sewa"
  | "utilitas"
  | "transportasi"
  | "marketing"
  | "marketplace"
  | "perlengkapan"
  | "penyusutan"
  | "pajak"
  | "asuransi"
  | "lainnya";

export type ExpenseStatus = "draft" | "approved" | "paid" | "cancelled";

export type Expense = {
  id: string;
  expense_no: string;
  /** Entitas pemilik biaya — derive dari store. */
  company?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  tax_amount: number;
  total: number;
  expense_date: string;
  payment_method?: PaymentMethod;
  status: ExpenseStatus;
  supplier?: string;
  reference_no?: string;
  notes?: string;
  attachment?: string;
  /** Toko terkait biaya (scope laporan). */
  store?: string;
  /** Gudang terkait — default dari toko, opsional override. */
  warehouse?: string;
  /** Akun kas/bank sumber dana — wajib jika status paid. */
  cash_account?: string;
  created_by: string;
  approved_by?: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: Supplier;
    store?: Store;
    warehouse?: { id: string; code: string; name: string };
    cash_account?: CashAccount;
    created_by?: { id: string; name?: string; email?: string };
  };
};

// ─── Tagihan Pembelian / Purchase Bill ───

export type PurchaseBillStatus =
  | "draft"
  | "unpaid"
  | "received"
  | "paid"
  | "overdue"
  | "cancelled";

export type PurchaseBill = {
  id: string;
  bill_no: string;
  purchase_order?: string;
  /** Entitas pemilik transaksi — derive dari PO/gudang. */
  company?: string;
  supplier: string;
  status: PurchaseBillStatus;
  bill_date: string;
  due_date: string;
  subtotal: number;
  discount_amount?: number;
  tax_amount: number;
  materai_amount?: number;
  total: number;
  paid_amount: number;
  remaining: number;
  is_cash?: boolean;
  cancel_reason?: string;
  notes?: string;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: Supplier;
    company?: { id: string; company_name: string; code?: string };
    purchase_order?: PurchaseOrder;
  };
};

export type StoreNpwpDisplay = "inherit" | "show" | "hide";

export type Store = {
  id: string;
  code: string;
  name: string;
  company?: string;
  /** inherit = ikut pengaturan perusahaan */
  npwp_display?: StoreNpwpDisplay;
  /** Override nama pengirim email (Resend) per toko — opsional di PocketBase */
  email_from_name?: string;
  /** Override alamat From (domain terverifikasi Resend) per toko */
  email_from_address?: string;
  email?: string;
  address?: string;
  city?: string;
  phone?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  logo?: string;
  default_warehouse: string;
  /** Toko utama entitas. */
  is_primary?: boolean;
  is_active: boolean;
  collectionId?: string;
  collectionName?: string;
  created: string;
  updated: string;
  expand?: {
    default_warehouse?: { id: string; code: string; name: string };
  };
};

export type TaxRate = {
  id: string;
  code: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
  created: string;
  updated: string;
};

export type PaymentTerm = {
  id: string;
  code: string;
  name: string;
  days: number;
  is_default: boolean;
  is_active: boolean;
  created: string;
  updated: string;
};

export type PaymentCondition = {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  created: string;
  updated: string;
};

export type CashAccountType = "bank" | "cash" | "ewallet";

export type CashAccount = {
  id: string;
  code: string;
  name: string;
  account_type: CashAccountType;
  /** Entitas pemilik akun kas/bank. */
  company?: string;
  /** Kas pusat — boleh transfer lintas entitas. */
  is_central?: boolean;
  /** Rekening utama entitas — default biaya & pembayaran hutang. */
  is_primary?: boolean;
  store?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  opening_balance?: number;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
  expand?: { store?: Store };
};

export type NpwpDisplayMode = "footer" | "header_secondary";

export type CompanyProfile = {
  id: string;
  /** Kode singkat entitas, mis. SDI */
  code?: string;
  company_name: string;
  legal_name?: string;
  is_active?: boolean;
  entity_type?: string;
  npwp?: string;
  show_npwp_on_documents?: boolean;
  npwp_display_mode?: NpwpDisplayMode;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  created: string;
  updated: string;
};

export type CashReconciliation = {
  id: string;
  cash_account: string;
  statement_date: string;
  statement_balance: number;
  book_balance: number;
  difference: number;
  notes?: string;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    cash_account?: CashAccount;
    created_by?: { id: string; name?: string; email?: string };
  };
};

export type CashTransferKind = "internal" | "inter_company";

export type CashTransfer = {
  id: string;
  transfer_no: string;
  from_account: string;
  to_account: string;
  amount: number;
  transfer_date: string;
  transfer_kind?: CashTransferKind;
  from_company?: string;
  to_company?: string;
  initiated_company?: string;
  notes?: string;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    from_account?: CashAccount;
    to_account?: CashAccount;
    from_company?: CompanyProfile;
    to_company?: CompanyProfile;
    created_by?: { id: string; name?: string; email?: string };
  };
};

/**
 * Nota kredit (Retur Penjualan) — contra revenue, metode akrual.
 * Transaksi asli (invoice) tidak diubah; pengurang pendapatan dicatat di
 * periode berjalan (cn_date) sehingga laba-rugi bulan lalu tidak berubah.
 */
export type CreditNote = {
  id: string;
  cn_no: string;
  /** Entitas pemilik nota kredit — derive dari invoice/SO. */
  company?: string;
  retur?: string;
  invoice?: string;
  sales_order?: string;
  /** Tanggal terbit — menentukan periode laba-rugi tempat retur dicatat. */
  cn_date: string;
  /** Total pengurang pendapatan (refund − kompensasi MP). */
  amount: number;
  /** Porsi yang mengurangi piutang (invoice.remaining). */
  applied_to_receivable: number;
  /** Porsi yang dikembalikan tunai ke pelanggan (mengurangi kas). */
  refunded: number;
  status: "issued" | "cancelled";
  reason?: string;
  notes?: string;
  created_by?: string;
  created: string;
  updated: string;
  expand?: {
    invoice?: Invoice;
    sales_order?: SalesOrder;
  };
};

export const BISNIS_COLLECTIONS = {
  customers: "biz_customers",
  suppliers: "biz_suppliers",
  salesOrders: "biz_sales_orders",
  salesOrderLines: "biz_sales_order_lines",
  invoices: "biz_invoices",
  purchaseOrders: "biz_purchase_orders",
  purchaseOrderLines: "biz_purchase_order_lines",
  returs: "biz_returs",
  returLines: "biz_retur_lines",
  productPrices: "biz_product_prices",
  payments: "biz_payments",
  expenses: "biz_expenses",
  purchaseBills: "biz_purchase_bills",
  billPayments: "biz_bill_payments",
  stores: "biz_stores",
  taxRates: "biz_tax_rates",
  paymentTerms: "biz_payment_terms",
  paymentConditions: "biz_payment_conditions",
  paymentMethods: "biz_payment_methods",
  couriers: "biz_couriers",
  courierServices: "biz_courier_services",
  salesChannels: "biz_sales_channels",
  mpSellerTiers: "biz_mp_seller_tiers",
  storeChannelAccounts: "biz_store_channel_accounts",
  mpFeeRules: "biz_mp_fee_rules",
  mpFeeTemplates: "biz_mp_fee_templates",
  mpFeeTemplateLines: "biz_mp_fee_template_lines",
  mpProductMappings: "biz_mp_product_mappings",
  mpTierDefaults: "biz_mp_tier_defaults",
  mpProductFees: "biz_mp_product_fees",
  productTags: "biz_product_tags",
  salesImportBatches: "biz_sales_import_batches",
  salesImportLines: "biz_sales_import_lines",
  paymentImportBatches: "biz_payment_import_batches",
  paymentImportLines: "biz_payment_import_lines",
  creditNotes: "biz_credit_notes",
  cashAccounts: "biz_cash_accounts",
  cashTransfers: "biz_cash_transfers",
  cashReconciliations: "biz_cash_reconciliations",
  companyProfile: "biz_company_profile",
} as const;

export const CASH_ACCOUNT_TYPE_LABELS: Record<CashAccountType, string> = {
  bank: "Bank",
  cash: "Kas",
  ewallet: "E-Wallet",
};

export const MP_FEE_TYPE_LABELS: Record<MpFeeType, string> = {
  category_fee: "Biaya Kategori",
  free_shipping: "Gratis Ongkir",
  cashback: "Cashback",
  mall_fee: "Biaya Mall",
  processing: "Biaya Pemrosesan",
  affiliate: "Affiliate",
};
