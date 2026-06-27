export type PosSaleMode = "direct" | "wms";

/** Master terminal — hanya identitas lokasi fisik (nama, kode, alamat). */
export type PosRegister = {
  id: string;
  code: string;
  name: string;
  address?: string;
  is_active: boolean;
  notes?: string;
  created: string;
  updated: string;
  /** @deprecated Pilih per sesi kasir, bukan di master */
  store?: string;
  warehouse?: string;
  responsible_name?: string;
  responsible_phone?: string;
  expand?: {
    store?: { id: string; name: string; code?: string };
    warehouse?: { id: string; name: string; code?: string };
  };
};

/** Disimpan di localStorage sampai logout POS. */
export type PosSession = {
  registerId: string;
  registerName: string;
  registerCode: string;
  registerAddress?: string;
  /** User login ERP yang bertindak sebagai kasir */
  cashierUserId?: string;
  storeId: string;
  storeName: string;
  warehouseId: string;
  warehouseName: string;
  responsibleName: string;
  responsiblePhone: string;
  mode: PosSaleMode;
  /** Mode WMS / penjualan marketplace */
  channelAccountId?: string;
  channelAccountName?: string;
  channelName?: string;
};

export type PosCartLine = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  imageUrl?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  stockAvailable?: number;
  requiresSerial?: boolean;
  serials?: string[];
};

/** Draft pembayaran di layar kasir (localStorage). */
export type PosPaymentDraft = {
  payAmount: number;
  paymentMethodId?: string;
  /** WMS — nomor AWB (unik per toko) */
  awb?: string;
};

export type PosCart = {
  lines: PosCartLine[];
  discountAmount: number;
};

export type PosDeliveryMode = "pickup" | "courier";

export type PosCheckoutDirect = {
  buyerName: string;
  buyerPhone: string;
  paymentMethodId: string;
  payAmount: number;
  notes?: string;
};

export type PosCheckoutWms = {
  buyerName: string;
  buyerPhone: string;
  deliveryMode: PosDeliveryMode;
  shippingAddress: string;
  courier: string;
  shippingService: string;
  shippingAmount: number;
  /** Kosong → sistem generate nomor pickup internal */
  awb: string;
  mpOrderNo: string;
};

export type PosMeta = {
  pos: true;
  mode: PosSaleMode;
  register_id: string;
  register_name: string;
  store_id?: string;
  store_name?: string;
  cashier_user_id?: string;
  cashier_name?: string;
  channel_name?: string;
  buyer_name: string;
  buyer_phone: string;
  channel_account_id?: string;
  shipping?: {
    address: string;
    courier: string;
    service: string;
    awb: string;
    mp_order_no: string;
  };
  /** Kode scan pickup gudang — bisa beda dari order_no jika SO otomatis. */
  pickup_code?: string;
};

export const POS_COLLECTIONS = {
  registers: "biz_pos_registers",
} as const;
