import { pb } from "@/lib/pocketbase";
import {
  applySalesStockOnly,
  createInvoice,
  createSalesOrder,
  createSalesOrderLine,
  sendSalesOrderToWarehouse,
} from "./client";
import {
  fetchSalesImportBatch,
  fetchSalesImportLines,
  fetchStoreChannelAccount,
  updateSalesImportBatch,
  updateSalesImportLine,
} from "./mp-client";
import { BISNIS_COLLECTIONS, type SalesImportLine } from "./types";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";
import { validateStockForSale } from "./stock-check";
import {
  accountChannelNames,
  buildMarketplaceInvoiceNotes,
} from "./mp-invoice-meta";

type OrderGroup = {
  orderNo: string;
  orderDate: string;
  lines: SalesImportLine[];
};

function groupLinesByOrder(lines: SalesImportLine[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const line of lines) {
    if (line.validation_status !== "valid") continue;
    const g = map.get(line.mp_order_no) ?? {
      orderNo: line.mp_order_no,
      orderDate: line.order_date,
      lines: [],
    };
    g.lines.push(line);
    map.set(line.mp_order_no, g);
  }
  return [...map.values()];
}

function buildOrderNotes(
  order: OrderGroup,
  account: Awaited<ReturnType<typeof fetchStoreChannelAccount>>,
): string {
  const totalGross = order.lines.reduce((s, l) => s + l.gross_amount, 0);
  const totalFees = order.lines.reduce((s, l) => s + l.total_fees, 0);
  const expectedNet = totalGross - totalFees;
  const buyer =
    order.lines.map((l) => l.mp_buyer_name?.trim()).find(Boolean) ?? undefined;
  const { channelName, accountName } = accountChannelNames(account);
  const breakdown = {
    mp_order_no: order.orderNo,
    gross: totalGross,
    fees: {
      category: order.lines.reduce((s, l) => s + l.fee_category, 0),
      free_shipping: order.lines.reduce((s, l) => s + l.fee_free_shipping, 0),
      cashback: order.lines.reduce((s, l) => s + l.fee_cashback, 0),
      mall: order.lines.reduce((s, l) => s + l.fee_mall, 0),
      processing: order.lines.reduce((s, l) => s + l.fee_processing, 0),
      affiliate: order.lines.reduce((s, l) => s + l.fee_affiliate, 0),
    },
    total_fees: totalFees,
    expected_net: expectedNet,
  };
  return buildMarketplaceInvoiceNotes({
    channelName,
    accountName,
    mpOrderNo: order.orderNo,
    mpBuyerName: buyer,
    feeBreakdownJson: breakdown,
  });
}

async function invoiceExistsForMpOrder(accountId: string, mpOrderNo: string): Promise<boolean> {
  try {
    const list = await pb.collection(BISNIS_COLLECTIONS.invoices).getList(1, 1, {
      filter: `mp_order_no = "${mpOrderNo.replace(/"/g, '\\"')}" && store_channel_account = "${accountId}"`,
      requestKey: null,
    });
    return list.totalItems > 0;
  } catch {
    return false;
  }
}

/** Posting batch valid → invoice + SO + stok keluar. */
export async function postSalesImportBatch(
  batchId: string,
  userId: string,
  opts?: { sendToPicking?: boolean },
): Promise<{ posted: number; skipped: number }> {
  const batch = await fetchSalesImportBatch(batchId);
  if (batch.status === "posted") throw new Error("Batch sudah diposting");
  if (batch.status === "cancelled") throw new Error("Batch dibatalkan");

  const account = await fetchStoreChannelAccount(batch.store_channel_account);
  const customerId = account.default_customer;
  if (!customerId) throw new Error("Akun toko-MP belum punya default customer. Atur di Pengaturan Penjualan Online.");

  const warehouseId = account.expand?.store?.default_warehouse;
  if (!warehouseId) throw new Error("Toko belum punya gudang default.");

  const allLines = await fetchSalesImportLines(batchId);
  const groups = groupLinesByOrder(allLines);

  let posted = 0;
  let skipped = 0;

  for (const order of groups) {
    if (order.lines.some((l) => !l.product)) {
      skipped++;
      continue;
    }

    if (await invoiceExistsForMpOrder(account.id, order.orderNo)) {
      for (const line of order.lines) {
        await updateSalesImportLine(line.id, { validation_status: "skipped", error_message: "Invoice sudah ada" });
      }
      skipped++;
      continue;
    }

    const subtotal = order.lines.reduce((s, l) => s + l.gross_amount, 0);
    const totalFees = order.lines.reduce((s, l) => s + l.total_fees, 0);
    const expectedNet = subtotal - totalFees;
    const feeNotes = buildOrderNotes(order, account);
    const mpBuyer =
      order.lines.map((l) => l.mp_buyer_name?.trim()).find(Boolean) ?? undefined;

    if (warehouseId) {
      const stockMsg = await validateStockForSale(
        warehouseId,
        order.lines.map((l) => ({
          product: l.product!,
          productName: l.product_name ?? l.expand?.product?.name,
          qty: l.qty,
        })),
      );
      if (stockMsg) {
        for (const line of order.lines) {
          await updateSalesImportLine(line.id, {
            validation_status: "error",
            error_message: stockMsg.split("\n")[0],
          });
        }
        skipped++;
        continue;
      }
    }

    const soNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.so, { periodDate: order.orderDate });

    const so = await createSalesOrder({
      order_no: soNo,
      customer: customerId,
      warehouse: warehouseId,
      order_date: order.orderDate,
      due_date: order.orderDate,
      status: "confirmed",
      payment_status: "unpaid",
      subtotal,
      discount_amount: 0,
      tax_amount: 0,
      total: subtotal,
      notes: feeNotes,
      created_by: userId,
    });

    await Promise.all(
      order.lines.map((l) =>
        createSalesOrderLine({
          sales_order: so.id,
          product: l.product!,
          sku_snapshot: l.mp_sku,
          name_snapshot: l.product_name ?? l.expand?.product?.name ?? l.mp_sku,
          qty: l.qty,
          unit_price: l.unit_price,
          discount_percent: 0,
          discount_amount: 0,
          tax_percent: 0,
          line_total: l.gross_amount,
        }),
      ),
    );

    const invNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.inv, { periodDate: order.orderDate });
    const inv = await createInvoice({
      invoice_no: invNo,
      sales_order: so.id,
      customer: customerId,
      issue_date: order.orderDate,
      due_date: order.orderDate,
      subtotal,
      discount_amount: 0,
      tax_amount: 0,
      total: subtotal,
      paid_amount: 0,
      remaining: subtotal,
      status: "unpaid",
      is_cash: false,
      notes: feeNotes,
      source: "marketplace_import",
      mp_order_no: order.orderNo,
      mp_buyer_name: mpBuyer,
      sales_channel: account.channel,
      store_channel_account: account.id,
      expected_net: expectedNet,
      mp_fees_json: JSON.stringify({
        total_fees: totalFees,
        expected_net: expectedNet,
      }),
      created_by: userId,
    });

    await applySalesStockOnly(so.id, {
      warehouse: warehouseId,
      reference_no: soNo,
      lines: order.lines.map((l) => ({ product: l.product!, qty: l.qty })),
    });
    if (opts?.sendToPicking) {
      await sendSalesOrderToWarehouse(so.id, userId);
    }

    for (const line of order.lines) {
      await updateSalesImportLine(line.id, {
        validation_status: "posted",
        invoice: inv.id,
      });
    }
    posted++;
  }

  await updateSalesImportBatch(batchId, {
    status: "posted",
    posted_rows: posted,
    posted_at: new Date().toISOString(),
  });

  return { posted, skipped };
}
