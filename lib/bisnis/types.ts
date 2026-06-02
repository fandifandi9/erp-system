export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

export type PaymentMethod = string;

export type PaymentMethodSetting = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created: string;
  updated: string;
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
  created: string;
  updated: string;
  expand?: {
    customer?: Customer;
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
  sales_channel?: string;
  store_channel_account?: string;
  expected_net?: number;
  mp_fees_json?: string;
  created_by: string;
  created: string;
  updated: string;
  expand?: {
    customer?: Customer;
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
  warehouse: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_date?: string;
  subtotal: number;
  tax_amount: number;
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
  /** JSON: QC / label / putaway per baris PO (lihat lib/wms/receiving-workflow.ts) */
  receiving_workflow_json?: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: Supplier;
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

export type Retur = {
  id: string;
  retur_no: string;
  type: ReturType;
  status: ReturStatus;
  reference_id?: string;
  customer?: string;
  supplier?: string;
  warehouse: string;
  reason?: string;
  total: number;
  created_by: string;
  created: string;
  updated: string;
};

export type ProductPrice = {
  id: string;
  product: string;
  price_level: string;
  sell_price: number;
  min_qty?: number;
  customer_group?: string;
  valid_from?: string;
  valid_to?: string;
  is_active: boolean;
};

// ─── Biaya / Expenses (Jurnal.id style) ───

export type ExpenseCategory =
  | "operasional"
  | "gaji"
  | "sewa"
  | "utilitas"
  | "transportasi"
  | "marketing"
  | "perlengkapan"
  | "penyusutan"
  | "pajak"
  | "asuransi"
  | "lainnya";

export type ExpenseStatus = "draft" | "approved" | "paid" | "cancelled";

export type Expense = {
  id: string;
  expense_no: string;
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
  created_by: string;
  approved_by?: string;
  created: string;
  updated: string;
  expand?: {
    supplier?: Supplier;
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
    purchase_order?: PurchaseOrder;
  };
};

export type Store = {
  id: string;
  code: string;
  name: string;
  email?: string;
  address?: string;
  city?: string;
  phone?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  logo?: string;
  default_warehouse: string;
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
  salesChannels: "biz_sales_channels",
  mpSellerTiers: "biz_mp_seller_tiers",
  storeChannelAccounts: "biz_store_channel_accounts",
  mpFeeRules: "biz_mp_fee_rules",
  mpFeeTemplates: "biz_mp_fee_templates",
  mpFeeTemplateLines: "biz_mp_fee_template_lines",
  mpProductMappings: "biz_mp_product_mappings",
  salesImportBatches: "biz_sales_import_batches",
  salesImportLines: "biz_sales_import_lines",
} as const;

export const MP_FEE_TYPE_LABELS: Record<MpFeeType, string> = {
  category_fee: "Biaya Kategori",
  free_shipping: "Gratis Ongkir",
  cashback: "Cashback",
  mall_fee: "Biaya Mall",
  processing: "Biaya Pemrosesan",
  affiliate: "Affiliate",
};
