import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { sendSalesOrderToWarehouseServer } from "@/lib/bisnis/sales-warehouse-server";
import { assertDocNoAvailable, BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "@/lib/bisnis/doc-number";
import { validateStockForSale } from "@/lib/bisnis/stock-check";
import {
  BISNIS_COLLECTIONS,
  type SalesImportBatch,
  type SalesImportLine,
  type StoreChannelAccount,
} from "@/lib/bisnis/types";
import { findOrCreatePosCustomer } from "@/lib/pos/customer";
import { buildPosNotes } from "@/lib/pos/meta";
import { buildNotesWithShipping } from "@/lib/bisnis/shipping-notes";
import { calcCartSubtotal, calcCartTotal } from "@/lib/pos/cart";
import type { PosCart, PosCheckoutWms, PosSession } from "@/lib/pos/types";
import type { ImportOrderHeader } from "@/lib/bisnis/mp-import-schema";
import { assertAwbUniqueForStore, normalizeAwb } from "@/lib/pos/awb-unique";
import { assertOrderNoUniqueForStore } from "@/lib/pos/order-no-unique";
import { resolvePosPickupNo } from "@/lib/pos/pickup-resolve";
import { resolvePickupCodeForPosOrder } from "@/lib/pos/pickup-code";
import type { SalesOrder } from "@/lib/bisnis/types";
import { serializeSerialNumbersJson } from "@/lib/wms/serial-numbers";
import { INV_COLLECTIONS } from "@/lib/inventory/types";

const WMS_PAYMENT_TERM_DAYS = 14;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CompleteWmsPosInput = {
  session: PosSession;
  cart: PosCart;
  checkout: PosCheckoutWms;
  userId: string;
};

export type CompleteWmsPosResult = {
  salesOrderId: string;
  orderNo: string;
  importBatchId: string;
  importBatchNo: string;
  reviewUrl: string;
  pickupNo: string;
  pickupType: "awb" | "internal";
  dueDate: string;
};

export async function completeWmsPosSale(
  input: CompleteWmsPosInput,
): Promise<CompleteWmsPosResult> {
  const { session, cart, checkout, userId } = input;
  if (!session.channelAccountId) {
    throw new Error("Akun marketplace belum dipilih di sesi POS.");
  }
  if (cart.lines.length === 0) throw new Error("Keranjang kosong");

  const pb = await getInventoryAdminPb();

  try {
    await pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getOne<StoreChannelAccount>(
      session.channelAccountId,
      { fields: "id,is_active", requestKey: null },
    );
  } catch {
    throw new Error("Akun marketplace tidak ditemukan atau tidak aktif.");
  }

  const customer = await findOrCreatePosCustomer({
    name: checkout.buyerName,
    phone: checkout.buyerPhone,
  });

  const subtotal = calcCartSubtotal(cart);
  const discount = Math.min(cart.discountAmount || 0, subtotal);
  const viaCourier = checkout.deliveryMode === "courier";
  const shipping = viaCourier ? Math.max(0, checkout.shippingAmount || 0) : 0;
  const total = calcCartTotal(cart, shipping);

  if (viaCourier) {
    if (!checkout.courier.trim() || !checkout.shippingService.trim()) {
      throw new Error("Pilih ekspedisi dan layanan pengiriman.");
    }
    if (!checkout.shippingAddress.trim()) {
      throw new Error("Alamat pengiriman wajib untuk kirim via ekspedisi.");
    }
  }
  if (total <= 0) throw new Error("Total transaksi harus lebih dari 0");

  const stockMsg = await validateStockForSale(
    session.warehouseId,
    cart.lines.map((l) => ({
      product: l.productId,
      productName: l.name,
      qty: l.qty,
    })),
    { warehouseName: session.warehouseName },
  );
  if (stockMsg) throw new Error(stockMsg);

  const awb = normalizeAwb(checkout.awb);
  if (awb) {
    await assertAwbUniqueForStore(pb, session.storeId, session.storeName, awb);
  }

  const today = new Date().toISOString().slice(0, 10);
  const dueDate = addDays(today, WMS_PAYMENT_TERM_DAYS);
  const externalOrderNo = checkout.mpOrderNo.trim();
  let orderNo: string;
  if (externalOrderNo) {
    await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.so, externalOrderNo);
    orderNo = externalOrderNo;
  } else {
    orderNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.so, { periodDate: today });
  }
  await assertOrderNoUniqueForStore(pb, session.storeId, session.storeName, orderNo);
  const pickupCode = await resolvePickupCodeForPosOrder(pb, orderNo, !!externalOrderNo);
  const mpOrderNo = externalOrderNo || `POS-${orderNo}`;
  const courierLabel = viaCourier ? checkout.courier.trim() : "Pickup toko";
  const serviceLabel = viaCourier ? checkout.shippingService.trim() : "Pickup langsung";

  const notes = buildNotesWithShipping(
    buildPosNotes(
      {
        pos: true,
        mode: "wms",
        register_id: session.registerId,
        register_name: session.registerName,
        store_id: session.storeId,
        store_name: session.storeName,
        cashier_user_id: session.cashierUserId,
        cashier_name: session.responsibleName,
        channel_name: session.channelName,
        buyer_name: checkout.buyerName.trim(),
        buyer_phone: checkout.buyerPhone.trim(),
        channel_account_id: session.channelAccountId,
        pickup_code: pickupCode,
        shipping: {
          address: checkout.shippingAddress.trim(),
          courier: courierLabel,
          service: serviceLabel,
          awb,
          mp_order_no: mpOrderNo,
        },
      },
      [
        viaCourier ? `Kirim via ekspedisi` : `Pickup langsung di toko`,
        `Kurir: ${courierLabel}`,
        `Layanan: ${serviceLabel}`,
        awb ? `AWB: ${awb}` : "AWB: (nomor pickup otomatis)",
        checkout.shippingAddress.trim()
          ? `Alamat: ${checkout.shippingAddress.trim()}`
          : "Alamat: (pickup di toko)",
        `Pembayaran: tempo ${WMS_PAYMENT_TERM_DAYS} hari (jatuh tempo ${dueDate})`,
      ].join("\n"),
    ),
    {
      enabled: viaCourier,
      courier: courierLabel,
      shipping_service: serviceLabel,
      tracking_no: awb,
      shipping_cost: shipping,
      recipient_address: checkout.shippingAddress.trim(),
    },
  );

  const whRow = await pb
    .collection(INV_COLLECTIONS.warehouses)
    .getOne(session.warehouseId, { fields: "company" })
    .catch(() => null);
  const companyId = (whRow as { company?: string } | null)?.company;

  const so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).create({
    order_no: orderNo,
    customer: customer.id,
    store: session.storeId,
    business_channel: "b2c",
    sale_mode: "online",
    platform_source: session.channelName?.trim() || "POS",
    warehouse: session.warehouseId,
    ...(companyId ? { company: companyId } : {}),
    status: "draft",
    payment_status: "unpaid",
    order_date: today,
    due_date: dueDate,
    subtotal,
    discount_amount: discount,
    tax_amount: 0,
    total,
    notes,
    pk_no: pickupCode,
    created_by: userId,
  });

  let rowNo = 0;
  for (const line of cart.lines) {
    rowNo += 1;
    const serialJson = serializeSerialNumbersJson(line.serials ?? []);
    await pb.collection(BISNIS_COLLECTIONS.salesOrderLines).create({
      sales_order: so.id,
      product: line.productId,
      sku_snapshot: line.sku,
      name_snapshot: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 0,
      line_total: line.lineTotal,
      ...(serialJson ? { serial_numbers_json: serialJson } : {}),
    });
  }

  await sendSalesOrderToWarehouseServer(so.id, userId);

  const soAfterWms = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(so.id, {
    fields: "id,order_no,pk_no,wms_booking_no,outbound_workflow_json,notes",
    requestKey: null,
  });
  const { pickupNo, pickupType } = resolvePosPickupNo(soAfterWms);

  const batchNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.imp, { periodDate: today });

  const batch = await pb.collection(BISNIS_COLLECTIONS.salesImportBatches).create<SalesImportBatch>({
    batch_no: batchNo,
    store_channel_account: session.channelAccountId,
    status: "draft",
    total_rows: cart.lines.length,
    valid_rows: 0,
    error_rows: 0,
    posted_rows: 0,
    notes: `Review POS WMS — SO ${orderNo} — ${session.registerName}`,
    created_by: userId,
  });

  const header: ImportOrderHeader = {
    toko: session.storeName,
    pelanggan: checkout.buyerName.trim(),
    tgl_transaksi: today,
    jatuh_tempo: dueDate,
    lewat_wms: true,
    mp_order_no: mpOrderNo,
    pembeli_mp: checkout.buyerName.trim(),
    ekspedisi: courierLabel,
    no_resi: awb,
    alamat_kirim: checkout.shippingAddress.trim(),
    ongkir: shipping,
    pesan: `Layanan: ${serviceLabel} · WA: ${checkout.buyerPhone.trim()}`,
    memo: `POS ${session.registerName}`,
  };

  rowNo = 0;
  for (const line of cart.lines) {
    rowNo += 1;
    const gross = line.lineTotal;
    await pb.collection(BISNIS_COLLECTIONS.salesImportLines).create<Partial<SalesImportLine>>({
      batch: batch.id,
      row_no: rowNo,
      mp_order_no: mpOrderNo,
      order_date: today,
      mp_buyer_name: checkout.buyerName.trim(),
      mp_sku: line.sku,
      product_name: line.name,
      qty: line.qty,
      unit_price: line.unitPrice,
      gross_amount: gross,
      product: line.productId,
      fee_category: 0,
      fee_free_shipping: 0,
      fee_cashback: 0,
      fee_mall: 0,
      fee_processing: 0,
      fee_affiliate: 0,
      total_fees: 0,
      expected_net: gross,
      validation_status: "pending",
      fee_override_json: JSON.stringify({
        customer_id: customer.id,
        pos_so_id: so.id,
        pos_register_id: session.registerId,
        header,
        source: "pos_wms",
      }),
    });
  }

  await pb.collection(BISNIS_COLLECTIONS.salesImportBatches).update(batch.id, {
    total_rows: cart.lines.length,
    notes: `${batch.notes ?? ""}\nSO: ${so.id}`,
  });

  return {
    salesOrderId: so.id,
    orderNo,
    importBatchId: batch.id,
    importBatchNo: batch.batch_no,
    reviewUrl: `/bisnis/penjualan/import/${batch.id}`,
    pickupNo,
    pickupType,
    dueDate,
  };
}
