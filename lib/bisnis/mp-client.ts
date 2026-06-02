import { ClientResponseError } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import {
  BISNIS_COLLECTIONS,
  type MpFeeRule,
  type MpProductMapping,
  type MpSellerTier,
  type SalesChannel,
  type SalesImportBatch,
  type SalesImportLine,
  type StoreChannelAccount,
} from "./types";
import { calculateOrderFees, type FeeContext, type LineInput } from "./mp-fee-engine";
import { buildImportLinePayload, type ParsedImportRow } from "./mp-import-parse";
import {
  buildProductSkuIndex,
  lineInputForFees,
  resolveProductBySku,
} from "./mp-product-resolve";
import { calculateTemplateOrderFees } from "./mp-template-engine";
import { fetchMpFeeTemplateLines } from "./mp-template-client";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";

type ListOpts = { filter?: string; expand?: string; sort?: string };

type PbListOpts = {
  filter?: string;
  expand?: string;
  sort?: string;
  fields?: string;
};

/** Coba getFullList; jika 400 (sort/expand salah), ulang tanpa expand / sort default. */
async function getFullListSafe<T>(collection: string, opts: PbListOpts = {}): Promise<T[]> {
  const attempts: PbListOpts[] = [
    opts,
    { ...opts, expand: undefined },
    { filter: opts.filter, sort: "-created" },
    { sort: "-created" },
  ];
  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return await pb.collection(collection).getFullList<T>({
        requestKey: null,
        filter: attempt.filter || undefined,
        expand: attempt.expand || undefined,
        sort: attempt.sort || undefined,
        fields: attempt.fields || undefined,
      });
    } catch (e) {
      lastErr = e;
      if (!(e instanceof ClientResponseError) || e.status !== 400) throw e;
    }
  }
  throw lastErr;
}

function collectionMissingHint(collection: string, e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return `Collection "${collection}" belum ada di PocketBase.`;
    if (e.status === 403 || e.status === 401) return `Akses ditolak ke "${collection}". Periksa API Rules.`;
    if (e.status === 400) {
      return `Collection "${collection}" error 400 — cek nama field relation (harus persis: channel, seller_tier, store, default_customer) dan field sort_order jika dipakai.`;
    }
  }
  return `Gagal memuat "${collection}".`;
}

// ─── Sales Channels ───

export async function fetchSalesChannels(activeOnly = true) {
  try {
    return await getFullListSafe<SalesChannel>(BISNIS_COLLECTIONS.salesChannels, {
      sort: "name",
      filter: activeOnly ? "is_active = true" : undefined,
    });
  } catch (e) {
    throw new Error(collectionMissingHint(BISNIS_COLLECTIONS.salesChannels, e));
  }
}

export async function createSalesChannel(data: Partial<SalesChannel>) {
  return pb.collection(BISNIS_COLLECTIONS.salesChannels).create<SalesChannel>(data);
}

export async function updateSalesChannel(id: string, data: Partial<SalesChannel>) {
  return pb.collection(BISNIS_COLLECTIONS.salesChannels).update<SalesChannel>(id, data);
}

export async function deleteSalesChannel(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesChannels).delete(id);
}

// ─── Seller Tiers ───

export async function fetchMpSellerTiers(channelId?: string) {
  const filter = channelId ? `channel = "${channelId}"` : undefined;
  try {
    return await getFullListSafe<MpSellerTier>(BISNIS_COLLECTIONS.mpSellerTiers, {
      sort: "sort_order,label",
      filter,
      expand: "channel",
    });
  } catch (e) {
    throw new Error(collectionMissingHint(BISNIS_COLLECTIONS.mpSellerTiers, e));
  }
}

export async function createMpSellerTier(data: Partial<MpSellerTier>) {
  return pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).create<MpSellerTier>(data);
}

export async function updateMpSellerTier(id: string, data: Partial<MpSellerTier>) {
  return pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).update<MpSellerTier>(id, data);
}

export async function deleteMpSellerTier(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).delete(id);
}

// ─── Store Channel Accounts ───

export async function fetchStoreChannelAccounts(activeOnly = true) {
  try {
    return await getFullListSafe<StoreChannelAccount>(BISNIS_COLLECTIONS.storeChannelAccounts, {
      sort: "account_name",
      filter: activeOnly ? "is_active = true" : undefined,
      expand: "store,channel,seller_tier,default_customer",
    });
  } catch (e) {
    throw new Error(collectionMissingHint(BISNIS_COLLECTIONS.storeChannelAccounts, e));
  }
}

export async function fetchStoreChannelAccount(id: string) {
  try {
    return await pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getOne<StoreChannelAccount>(id, {
      expand: "store,channel,seller_tier,default_customer",
      requestKey: null,
    });
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400) {
      return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getOne<StoreChannelAccount>(id, {
        requestKey: null,
      });
    }
    throw e;
  }
}

export async function createStoreChannelAccount(data: Partial<StoreChannelAccount>) {
  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).create<StoreChannelAccount>(data);
}

export async function updateStoreChannelAccount(id: string, data: Partial<StoreChannelAccount>) {
  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).update<StoreChannelAccount>(id, data);
}

export async function deleteStoreChannelAccount(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).delete(id);
}

// ─── Fee Rules ───

export async function fetchMpFeeRules(opts?: ListOpts) {
  try {
    return await getFullListSafe<MpFeeRule>(BISNIS_COLLECTIONS.mpFeeRules, {
      sort: opts?.sort ?? "-priority,-created",
      filter: opts?.filter,
    });
  } catch (e) {
    throw new Error(collectionMissingHint(BISNIS_COLLECTIONS.mpFeeRules, e));
  }
}

export async function createMpFeeRule(data: Partial<MpFeeRule>) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeRules).create<MpFeeRule>(data);
}

export async function updateMpFeeRule(id: string, data: Partial<MpFeeRule>) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeRules).update<MpFeeRule>(id, data);
}

export async function deleteMpFeeRule(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpFeeRules).delete(id);
}

// ─── Product Mappings ───

export async function fetchMpProductMappings(opts?: ListOpts) {
  try {
    return await getFullListSafe<MpProductMapping>(BISNIS_COLLECTIONS.mpProductMappings, {
      sort: "mp_sku",
      filter: opts?.filter,
      expand: "product",
    });
  } catch (e) {
    throw new Error(collectionMissingHint(BISNIS_COLLECTIONS.mpProductMappings, e));
  }
}

export async function createMpProductMapping(data: Partial<MpProductMapping>) {
  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).create<MpProductMapping>(data);
}

export async function updateMpProductMapping(id: string, data: Partial<MpProductMapping>) {
  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).update<MpProductMapping>(id, data);
}

export async function deleteMpProductMapping(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).delete(id);
}

// ─── Import Batches ───

export async function fetchSalesImportBatches(opts?: { page?: number; perPage?: number }) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportBatches).getList<SalesImportBatch>(
    opts?.page ?? 1,
    opts?.perPage ?? 20,
    {
      sort: "-created",
      expand: "store_channel_account,store_channel_account.store,store_channel_account.channel",
      requestKey: null,
    },
  );
}

export async function fetchSalesImportBatch(id: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportBatches).getOne<SalesImportBatch>(id, {
    expand:
      "store_channel_account,store_channel_account.store,store_channel_account.channel,store_channel_account.seller_tier,fee_template",
    requestKey: null,
  });
}

export async function createSalesImportBatch(data: Partial<SalesImportBatch>) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportBatches).create<SalesImportBatch>(data);
}

export async function updateSalesImportBatch(id: string, data: Partial<SalesImportBatch>) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportBatches).update<SalesImportBatch>(id, data);
}

export async function fetchSalesImportLines(batchId: string) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportLines).getFullList<SalesImportLine>({
    filter: `batch = "${batchId}"`,
    sort: "row_no",
    expand: "product,product.category,invoice",
    requestKey: null,
  });
}

export async function createSalesImportLine(data: Partial<SalesImportLine>) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportLines).create<SalesImportLine>(data);
}

export async function updateSalesImportLine(id: string, data: Partial<SalesImportLine>) {
  return pb.collection(BISNIS_COLLECTIONS.salesImportLines).update<SalesImportLine>(id, data);
}

/** Upload baris Excel → staging lines + hitung fee. */
export async function processImportRows(
  batchId: string,
  accountId: string,
  rows: ParsedImportRow[],
  templateId?: string,
): Promise<{ valid: number; errors: number }> {
  const account = await fetchStoreChannelAccount(accountId);
  const effectiveTemplateId = templateId || account.default_fee_template;
  const templateLines = effectiveTemplateId
    ? await fetchMpFeeTemplateLines(effectiveTemplateId)
    : [];
  const useTemplate = templateLines.length > 0;

  const rules = useTemplate ? [] : await fetchMpFeeRules({ filter: "is_active = true" });
  const mappings = await fetchMpProductMappings({
    filter: "is_active = true",
    expand: "product",
  });
  const productBySku = await buildProductSkuIndex();

  const ctx: FeeContext = {
    channelId: account.channel,
    storeId: account.store,
    storeChannelAccountId: account.id,
    sellerTierId: account.seller_tier,
    orderDate: rows[0]?.order_date ?? new Date().toISOString().slice(0, 10),
  };

  const byOrder = new Map<string, ParsedImportRow[]>();
  for (const row of rows) {
    const list = byOrder.get(row.mp_order_no) ?? [];
    list.push(row);
    byOrder.set(row.mp_order_no, list);
  }

  let valid = 0;
  let errors = 0;

  for (const [, orderRows] of byOrder) {
    const orderDate = orderRows[0].order_date;
    const lineInputs: LineInput[] = [];
    const resolved: {
      row: ParsedImportRow;
      productId?: string;
      internalCategoryId?: string;
      error?: string;
    }[] = [];

    for (const row of orderRows) {
      const { resolved: prod, error } = resolveProductBySku(row.mp_sku, account, mappings, productBySku);
      resolved.push({
        row,
        productId: prod?.productId,
        internalCategoryId: prod?.internalCategoryId,
        error,
      });
      lineInputs.push(lineInputForFees(row, prod));
    }

    let lineIdx = 0;
    if (useTemplate) {
      const tFees = calculateTemplateOrderFees(templateLines, lineInputs);
      const orderDenom =
        tFees.legacy.fee_free_shipping +
        tFees.legacy.fee_cashback +
        tFees.legacy.fee_mall +
        tFees.legacy.fee_processing +
        tFees.legacy.fee_affiliate;

      for (const { row, productId, error } of resolved) {
        const catFee = tFees.lineCategoryFees[lineIdx] ?? 0;
        const alloc = tFees.lineAllocatedOrderFees[lineIdx] ?? 0;
        const lineTotalFees = catFee + alloc;
        const hasError = !!error;
        if (hasError) errors++;
        else valid++;

        const freeShipShare =
          orderDenom > 0 && row.gross_amount > 0
            ? Math.round((alloc * tFees.legacy.fee_free_shipping) / orderDenom)
            : 0;

        await createSalesImportLine(
          buildImportLinePayload(batchId, row, {
            product: productId,
            fee_category: catFee,
            fee_free_shipping: freeShipShare,
            fee_cashback: lineIdx === 0 ? tFees.legacy.fee_cashback : 0,
            fee_mall: lineIdx === 0 ? tFees.legacy.fee_mall : 0,
            fee_processing: lineIdx === 0 ? tFees.legacy.fee_processing : 0,
            fee_affiliate: lineIdx === 0 ? tFees.legacy.fee_affiliate : 0,
            total_fees: lineTotalFees,
            expected_net: row.gross_amount - lineTotalFees,
            fee_override_json: JSON.stringify({
              template_id: effectiveTemplateId,
              items: tFees.items,
              line_index: lineIdx,
            }),
            validation_status: hasError ? "error" : "valid",
            error_message: error,
          }),
        );
        lineIdx++;
      }
    } else {
      const oFees = calculateOrderFees(rules, { ...ctx, orderDate }, lineInputs);
      const orderDenom =
        oFees.free_shipping + oFees.cashback + oFees.mall_fee + oFees.processing + oFees.affiliate;

      for (const { row, productId, error } of resolved) {
        const catFee = oFees.line_category_fees[lineIdx] ?? 0;
        const alloc = oFees.line_allocated_order_fees[lineIdx] ?? 0;
        const lineTotalFees = catFee + alloc;
        const hasError = !!error;
        if (hasError) errors++;
        else valid++;

        const freeShipShare =
          orderDenom > 0 && row.gross_amount > 0
            ? Math.round((alloc * oFees.free_shipping) / orderDenom)
            : 0;

        await createSalesImportLine(
          buildImportLinePayload(batchId, row, {
            product: productId,
            fee_category: catFee,
            fee_free_shipping: freeShipShare,
            fee_cashback: lineIdx === 0 ? oFees.cashback : 0,
            fee_mall: lineIdx === 0 ? oFees.mall_fee : 0,
            fee_processing: lineIdx === 0 ? oFees.processing : 0,
            fee_affiliate: lineIdx === 0 ? oFees.affiliate : 0,
            total_fees: lineTotalFees,
            expected_net: row.gross_amount - lineTotalFees,
            validation_status: hasError ? "error" : "valid",
            error_message: error,
          }),
        );
        lineIdx++;
      }
    }
  }

  await updateSalesImportBatch(batchId, {
    status: errors > 0 ? "draft" : "validated",
    total_rows: rows.length,
    valid_rows: valid,
    error_rows: errors,
    fee_template: effectiveTemplateId || undefined,
  });

  return { valid, errors };
}

export async function createImportBatchFromFile(
  accountId: string,
  rows: ParsedImportRow[],
  userId: string,
  filename?: string,
  templateId?: string,
): Promise<SalesImportBatch> {
  const batchNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.imp);

  const dates = rows.map((r) => r.order_date).sort();
  const batch = await createSalesImportBatch({
    batch_no: batchNo,
    store_channel_account: accountId,
    period_from: dates[0],
    period_to: dates[dates.length - 1],
    status: "draft",
    total_rows: rows.length,
    valid_rows: 0,
    error_rows: 0,
    posted_rows: 0,
    source_filename: filename,
    created_by: userId,
  });

  await processImportRows(batch.id, accountId, rows, templateId);
  return fetchSalesImportBatch(batch.id);
}
