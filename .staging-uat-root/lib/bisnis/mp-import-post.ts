import { pb } from "@/lib/pocketbase";
import {
  applySalesStockOnly,
  createInvoice,
  createSalesOrder,
  createSalesOrderLine,
  fetchPaymentMethods,
  fetchPaymentTerms,
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
import {
  BIZ_DOC_NUMBER_CONFIG,
  assertDocNoAvailable,
  nextDocNo,
  resolveInvoiceNoForSalesOrder,
} from "./doc-number";
import { validateStockForSale } from "./stock-check";
import { accountChannelNames } from "./mp-invoice-meta";
import {
  buildImportSoNotes,
  buildMpFeeNotesBlock,
  calcOrderTotals,
  findCustomerByName,
  parseImportHeaderFromJson,
  resolvePaymentMethodId,
  resolvePaymentTerm,
} from "./mp-import-order-build";
import type { ImportOrderHeader } from "./mp-import-schema";
import {
  assertSalesLineSerials,
  fetchRequiresSerialMap,
  parseImportLineSerials,
  serializeSerialNumbersJson,
} from "@/lib/wms/serial-numbers";
import { enrichInvoiceWithStore } from "@/lib/tenant/invoice-enrich";
import { emitBusinessEvent } from "@/lib/tenant/activity-events";
import { postMarketplaceFeeExpense } from "./mp-fee-expense";

type OrderGroup = {
  orderNo: string;
  orderDate: string;
  header: ImportOrderHeader;
  customerId: string;
  lines: SalesImportLine[];
};

function parseLineMeta(line: SalesImportLine): {
  header: ImportOrderHeader | null;
  customerId?: string;
} {
  const fromJson = parseImportHeaderFromJson(line.fee_override_json);
  if (fromJson) {
    try {
      const o = JSON.parse(line.fee_override_json ?? "{}") as { customer_id?: string };
      return { header: fromJson, customerId: o.customer_id };
    } catch {
      return { header: fromJson };
    }
  }
  return { header: null };
}

function groupLinesByOrder(lines: SalesImportLine[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const line of lines) {
    if (line.validation_status !== "valid") continue;
    const { header, customerId } = parseLineMeta(line);
    if (!header) continue;
    const g = map.get(line.mp_order_no) ?? {
      orderNo: line.mp_order_no,
      orderDate: line.order_date,
      header,
      customerId: customerId ?? "",
      lines: [],
    };
    if (customerId) g.customerId = customerId;
    g.lines.push(line);
    map.set(line.mp_order_no, g);
  }
  return [...map.values()];
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

/** Posting batch valid → SO + invoice + stok (field selaras form Buat Penjualan). */
export async function postSalesImportBatch(
  batchId: string,
  userId: string,
  opts?: { sendToPicking?: boolean },
): Promise<{ posted: number; skipped: number }> {
  const batch = await fetchSalesImportBatch(batchId);
  if (batch.status === "cancelled") throw new Error("Batch dibatalkan");
  if (batch.status === "posted" && batch.posted_rows > 0) {
    const existing = await fetchSalesImportLines(batchId);
    const validOrders = new Set(
      existing.filter((l) => l.validation_status === "valid").map((l) => l.mp_order_no),
    ).size;
    if (batch.posted_rows >= validOrders && validOrders > 0) {
      throw new Error("Batch sudah diposting penuh");
    }
  }

  const account = await fetchStoreChannelAccount(batch.store_channel_account);
  const storeId = account.store;
  const warehouseId = account.expand?.store?.default_warehouse;
  if (!warehouseId) throw new Error("Toko belum punya gudang default.");

  const [paymentMethods, paymentTerms] = await Promise.all([
    fetchPaymentMethods().catch(() => []),
    fetchPaymentTerms().catch(() => []),
  ]);

  const allLines = await fetchSalesImportLines(batchId);
  const groups = groupLinesByOrder(allLines);
  const targetOrders = new Set(
    allLines.filter((l) => l.validation_status === "valid").map((l) => l.mp_order_no),
  ).size;

  let posted = 0;
  let skipped = 0;

  for (const order of groups) {
    if (order.lines.every((l) => l.validation_status === "posted")) {
      continue;
    }

    if (order.lines.some((l) => !l.product)) {
      skipped++;
      continue;
    }

    if (await invoiceExistsForMpOrder(account.id, order.orderNo)) {
      for (const line of order.lines) {
        await updateSalesImportLine(line.id, {
          validation_status: "skipped",
          error_message: "Invoice sudah ada",
        });
      }
      skipped++;
      continue;
    }

    let customerId = order.customerId;
    if (!customerId) {
      const c = await findCustomerByName(order.header.pelanggan);
      customerId = c?.id ?? "";
    }
    if (!customerId) {
      skipped++;
      continue;
    }

    const lineTotals = order.lines.map((l) => l.gross_amount);
    const totals = calcOrderTotals(lineTotals, order.header);
    const totalFees = order.lines.reduce((s, l) => s + l.total_fees, 0);
    const totalGross = order.lines.reduce((s, l) => s + l.gross_amount, 0);
    const { channelName, accountName } = accountChannelNames(account);

    const feeBreakdown = {
      category: order.lines.reduce((s, l) => s + l.fee_category, 0),
      free_shipping: order.lines.reduce((s, l) => s + l.fee_free_shipping, 0),
      cashback: order.lines.reduce((s, l) => s + l.fee_cashback, 0),
      mall: order.lines.reduce((s, l) => s + l.fee_mall, 0),
      processing: order.lines.reduce((s, l) => s + l.fee_processing, 0),
      affiliate: order.lines.reduce((s, l) => s + l.fee_affiliate, 0),
    };

    const mpFeeNotes = buildMpFeeNotesBlock({
      channelName,
      accountName,
      header: order.header,
      totalGross,
      totalFees,
      feeBreakdown,
    });
    const notes = buildImportSoNotes(order.header, mpFeeNotes);

    const termResolved = resolvePaymentTerm(
      paymentTerms,
      order.header.term,
      order.header.tgl_transaksi,
    );
    const dueDate =
      order.header.jatuh_tempo ||
      termResolved.dueDate ||
      order.header.tgl_transaksi;
    const paymentMethod = resolvePaymentMethodId(paymentMethods, order.header.metode_bayar);

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

    const sendWms = opts?.sendToPicking ?? order.header.lewat_wms;

    if (!sendWms) {
      const productIds = order.lines.map((l) => l.product!).filter(Boolean);
      const requiresMap = await fetchRequiresSerialMap(productIds);
      const nameByProduct = Object.fromEntries(
        order.lines.map((l) => [
          l.product!,
          l.product_name ?? l.expand?.product?.name ?? l.mp_sku,
        ]),
      );
      try {
        assertSalesLineSerials(
          order.lines.map((l) => ({
            product: l.product!,
            qty: l.qty,
            serials: parseImportLineSerials(l.fee_override_json),
            name: nameByProduct[l.product!],
          })),
          requiresMap,
          nameByProduct,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Serial number wajib belum lengkap";
        for (const line of order.lines) {
          await updateSalesImportLine(line.id, {
            validation_status: "error",
            error_message: msg,
          });
        }
        skipped++;
        continue;
      }
    }

    let soNo = order.header.no_so?.trim() ?? "";
    if (soNo) {
      await assertDocNoAvailable(BIZ_DOC_NUMBER_CONFIG.so, soNo);
    } else {
      soNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.so, { periodDate: order.orderDate });
    }

    const so = await createSalesOrder({
      order_no: soNo,
      customer: customerId,
      store: storeId,
      business_channel: "b2c",
      sale_mode: "online",
      platform_source: channelName,
      warehouse: warehouseId,
      order_date: order.header.tgl_transaksi,
      due_date: dueDate,
      status: "confirmed",
      payment_status: "unpaid",
      payment_method: paymentMethod,
      subtotal: totals.subtotal,
      discount_amount: totals.discount_amount,
      tax_amount: totals.tax_amount,
      materai_amount: totals.materai_amount,
      total: totals.total,
      notes,
      created_by: userId,
    });

    await Promise.all(
      order.lines.map((l) => {
        let discPct = 0;
        try {
          const meta = JSON.parse(l.fee_override_json ?? "{}") as { line_discount_percent?: number };
          discPct = meta.line_discount_percent ?? 0;
        } catch {
          /* ignore */
        }
        const discAmt = Math.round(l.qty * l.unit_price * (discPct / 100));
        const serialJson = serializeSerialNumbersJson(parseImportLineSerials(l.fee_override_json));
        return createSalesOrderLine(
          {
            sales_order: so.id,
            product: l.product!,
            sku_snapshot: l.mp_sku,
            name_snapshot: l.product_name ?? l.expand?.product?.name ?? l.mp_sku,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_percent: discPct,
            discount_amount: discAmt,
            tax_percent: 0,
            line_total: l.gross_amount,
            ...(serialJson ? { serial_numbers_json: serialJson } : {}),
          },
          { skipSerialValidation: sendWms },
        );
      }),
    );

    const invNo = await resolveInvoiceNoForSalesOrder(soNo, { periodDate: order.orderDate });
    const isCash =
      !paymentMethod ||
      !order.header.jatuh_tempo ||
      dueDate.slice(0, 10) === order.header.tgl_transaksi.slice(0, 10);

    const inv = await createInvoice(
      await enrichInvoiceWithStore(
        {
          invoice_no: invNo,
          sales_order: so.id,
          customer: customerId,
          issue_date: order.header.tgl_transaksi,
          due_date: dueDate,
          subtotal: totals.subtotal,
          discount_amount: totals.discount_amount,
          tax_amount: totals.tax_amount,
          materai_amount: totals.materai_amount,
          total: totals.total,
          paid_amount: 0,
          remaining: totals.total,
          status: "unpaid",
          is_cash: isCash,
          notes,
          source: "marketplace_import",
          mp_order_no: order.orderNo,
          mp_buyer_name: order.header.pembeli_mp,
          business_channel: "b2c",
          sale_mode: "online",
          platform_source: channelName,
          sales_channel: account.channel,
          store_channel_account: account.id,
          expected_net: totalGross - totalFees,
          mp_fees_json: JSON.stringify({
            total_fees: totalFees,
            expected_net: totalGross - totalFees,
            // Snapshot rincian fee saat posting — tidak berubah walau master fee diedit.
            breakdown: {
              product_fee: feeBreakdown.category,
              free_shipping: feeBreakdown.free_shipping,
              cashback: feeBreakdown.cashback,
              mall: feeBreakdown.mall,
              processing: feeBreakdown.processing,
              affiliate: feeBreakdown.affiliate,
            },
          }),
          created_by: userId,
        },
        storeId,
      ),
    );

    if (totalFees > 0) {
      await postMarketplaceFeeExpense({
        feeAmount: totalFees,
        expenseDate: order.header.tgl_transaksi,
        platformLabel: channelName,
        mpOrderNo: order.orderNo,
        invoiceNo: inv.invoice_no,
        invoiceId: inv.id,
        storeId,
        createdBy: userId,
      });
    }

    void emitBusinessEvent({
      event_code: "sales.order.created",
      module: "sales",
      entity_type: "biz_sales_orders",
      entity_id: so.id,
      entity_label: soNo,
      store_id: storeId,
      warehouse_id: warehouseId,
      payload: { order_no: soNo, mp: true },
      actor_id: userId,
    });
    void emitBusinessEvent({
      event_code: "sales.invoice.created",
      module: "sales",
      entity_type: "biz_invoices",
      entity_id: inv.id,
      entity_label: inv.invoice_no,
      store_id: storeId,
      warehouse_id: warehouseId,
      payload: { invoice_no: inv.invoice_no, order_no: soNo, mp: true },
      actor_id: userId,
    });

    await applySalesStockOnly(so.id, {
      warehouse: warehouseId,
      reference_no: soNo,
      lines: order.lines.map((l) => ({
        product: l.product!,
        qty: l.qty,
      })),
    });

    if (sendWms) {
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

  const status =
    posted >= targetOrders && targetOrders > 0
      ? "posted"
      : posted > 0
        ? "posted"
        : "validated";

  await updateSalesImportBatch(batchId, {
    status,
    posted_rows: (batch.posted_rows ?? 0) + posted,
    posted_at: posted > 0 ? new Date().toISOString() : batch.posted_at,
  });

  return { posted, skipped };
}
