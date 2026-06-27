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
import { calcSkuFee, resolveSkuFees, type ResolvedSkuFee } from "./mp-sku-fee-server";
import { buildImportLinePayload, type ParsedImportRow } from "./mp-import-parse";
import {
  buildProductSkuIndex,
  lineInputForFees,
  resolveProductBySku,
} from "./mp-product-resolve";
import { calculateTemplateOrderFees } from "./mp-template-engine";
import { fetchMpFeeTemplateLines } from "./mp-template-client";
import { BIZ_DOC_NUMBER_CONFIG, nextDocNo } from "./doc-number";
import {
  getOrCreateImportAccount,
  validateImportTokoRows,
  fetchStoreNameForImport,
} from "./mp-import-resolve";
import { findCustomerByName } from "./mp-import-order-build";
import type { ImportOrderHeader } from "./mp-import-schema";

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
  const skipMpFees = !effectiveTemplateId;

  const rules =
    useTemplate || skipMpFees ? [] : await fetchMpFeeRules({ filter: "is_active = true" });
  const mappings = await fetchMpProductMappings({
    filter: "is_active = true",
    expand: "product",
  });
  const productBySku = await buildProductSkuIndex();

  // Fee Engine per SKU (channel + tier + SKU): resolve sekali untuk seluruh batch.
  // Jika aktif, fee produk & affiliate diambil dari engine ini (SKU → default tier),
  // sedangkan biaya per-order (gratis ongkir, proses, dll.) tetap dari template/rules.
  const tierId = account.seller_tier || "";
  let skuFeeMap = new Map<string, ResolvedSkuFee>();
  let skuEngineActive = false;
  if (tierId) {
    const allProductIds = new Set<string>();
    for (const row of rows) {
      const { resolved: prod } = resolveProductBySku(row.mp_sku, account, mappings, productBySku);
      if (prod?.productId) allProductIds.add(prod.productId);
    }
    if (allProductIds.size > 0) {
      try {
        const r = await resolveSkuFees(pb, { tierId, productIds: [...allProductIds] });
        skuFeeMap = r.byProduct;
        skuEngineActive =
          !!r.tierDefault ||
          [...r.byProduct.values()].some((f) => f.mp_source !== "none" || f.aff_source !== "none");
      } catch {
        // Collection fee engine belum dibuat → pakai perilaku lama.
      }
    }
  }

  /** Snapshot fee SKU untuk satu baris; null jika engine nonaktif/produk tidak dikenal. */
  function skuFeeFor(productId: string | undefined, gross: number, qty: number) {
    if (!skuEngineActive || !productId) return null;
    const f = skuFeeMap.get(productId);
    if (!f) return null;
    return {
      mp: calcSkuFee(f.mp, gross, qty),
      aff: calcSkuFee(f.aff, gross, qty),
      snapshot: {
        tier: tierId,
        mp_source: f.mp_source,
        aff_source: f.aff_source,
        mp_spec: f.mp,
        aff_spec: f.aff,
      },
    };
  }

  const ctx: FeeContext = {
    channelId: account.channel,
    storeId: account.store,
    storeChannelAccountId: account.id,
    sellerTierId: account.seller_tier,
    orderDate: rows[0]?.header.tgl_transaksi ?? new Date().toISOString().slice(0, 10),
  };

  const byOrder = new Map<string, ParsedImportRow[]>();
  for (const row of rows) {
    const key = row.header.mp_order_no;
    const list = byOrder.get(key) ?? [];
    list.push(row);
    byOrder.set(key, list);
  }

  let valid = 0;
  let errors = 0;

  function feeJson(header: ImportOrderHeader, extra: Record<string, unknown>): string {
    return JSON.stringify({ import_header: header, ...extra });
  }

  for (const [, orderRows] of byOrder) {
    const header = orderRows[0].header;
    const orderDate = header.tgl_transaksi;

    if (!header.pelanggan.trim()) {
      for (const row of orderRows) {
        errors++;
        await createSalesImportLine(
          buildImportLinePayload(batchId, row, {
            product: undefined,
            fee_category: 0,
            fee_free_shipping: 0,
            fee_cashback: 0,
            fee_mall: 0,
            fee_processing: 0,
            fee_affiliate: 0,
            total_fees: 0,
            expected_net: row.gross_amount,
            fee_override_json: feeJson(header, {}),
            validation_status: "error",
            error_message: "Kolom pelanggan (*) wajib diisi",
          }),
        );
      }
      continue;
    }

    const customer = await findCustomerByName(header.pelanggan);
    if (!customer) {
      for (const row of orderRows) {
        errors++;
        await createSalesImportLine(
          buildImportLinePayload(batchId, row, {
            product: undefined,
            fee_category: 0,
            fee_free_shipping: 0,
            fee_cashback: 0,
            fee_mall: 0,
            fee_processing: 0,
            fee_affiliate: 0,
            total_fees: 0,
            expected_net: row.gross_amount,
            fee_override_json: feeJson(header, { customer_error: true }),
            validation_status: "error",
            error_message: `Pelanggan "${header.pelanggan}" tidak ada di master Kontak`,
          }),
        );
      }
      continue;
    }

    const headerWithCustomer = { ...header, email: header.email || customer.email };
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
    if (skipMpFees) {
      for (const { row, productId, error } of resolved) {
        const hasError = !!error;
        if (hasError) errors++;
        else valid++;
        const sku = skuFeeFor(productId, row.gross_amount, row.qty);
        const skuMp = sku?.mp ?? 0;
        const skuAff = sku?.aff ?? 0;
        await createSalesImportLine(
          buildImportLinePayload(batchId, row, {
            product: productId,
            fee_category: skuMp,
            fee_free_shipping: 0,
            fee_cashback: 0,
            fee_mall: 0,
            fee_processing: 0,
            fee_affiliate: skuAff,
            total_fees: skuMp + skuAff,
            expected_net: row.gross_amount - skuMp - skuAff,
            fee_override_json: feeJson(headerWithCustomer, {
              customer_id: customer.id,
              line_discount_percent: row.discount_percent,
              ...(sku ? { sku_fee: sku.snapshot } : {}),
            }),
            validation_status: hasError ? "error" : "valid",
            error_message: error,
          }),
        );
      }
    } else if (useTemplate) {
      // Engine SKU aktif → fee produk & affiliate dari engine; baris template
      // per-produk/kategori/affiliate dikecualikan agar tidak dobel hitung.
      const effectiveTplLines = skuEngineActive
        ? templateLines.filter((l) => {
            const code = `${l.code} ${l.label}`.toLowerCase();
            const perLine =
              l.line_group === "product" ||
              l.line_group === "category" ||
              !!l.scope_product ||
              !!l.internal_category;
            return !perLine && !code.includes("affiliate") && !code.includes("afiliasi");
          })
        : templateLines;
      const tFees = calculateTemplateOrderFees(effectiveTplLines, lineInputs);
      const orderDenom =
        tFees.legacy.fee_free_shipping +
        tFees.legacy.fee_cashback +
        tFees.legacy.fee_mall +
        tFees.legacy.fee_processing +
        tFees.legacy.fee_affiliate;

      for (const { row, productId, error } of resolved) {
        const sku = skuFeeFor(productId, row.gross_amount, row.qty);
        const catFee = sku ? sku.mp : (tFees.lineCategoryFees[lineIdx] ?? 0);
        const affFee = sku ? sku.aff : lineIdx === 0 ? tFees.legacy.fee_affiliate : 0;
        const alloc = tFees.lineAllocatedOrderFees[lineIdx] ?? 0;
        const lineTotalFees = sku ? catFee + affFee + alloc : catFee + alloc;
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
            fee_affiliate: affFee,
            total_fees: lineTotalFees,
            expected_net: row.gross_amount - lineTotalFees,
            fee_override_json: feeJson(headerWithCustomer, {
              customer_id: customer.id,
              line_discount_percent: row.discount_percent,
              template_id: effectiveTemplateId,
              items: tFees.items,
              line_index: lineIdx,
              ...(sku ? { sku_fee: sku.snapshot } : {}),
            }),
            validation_status: hasError ? "error" : "valid",
            error_message: error,
          }),
        );
        lineIdx++;
      }
    } else {
      // Engine SKU aktif → rules category_fee & affiliate dikecualikan (anti dobel).
      const effectiveRules = skuEngineActive
        ? rules.filter((r) => r.fee_type !== "category_fee" && r.fee_type !== "affiliate")
        : rules;
      const oFees = calculateOrderFees(effectiveRules, { ...ctx, orderDate }, lineInputs);
      const orderDenom =
        oFees.free_shipping + oFees.cashback + oFees.mall_fee + oFees.processing + oFees.affiliate;

      for (const { row, productId, error } of resolved) {
        const sku = skuFeeFor(productId, row.gross_amount, row.qty);
        const catFee = sku ? sku.mp : (oFees.line_category_fees[lineIdx] ?? 0);
        const affFee = sku ? sku.aff : lineIdx === 0 ? oFees.affiliate : 0;
        const alloc = oFees.line_allocated_order_fees[lineIdx] ?? 0;
        const lineTotalFees = sku ? catFee + affFee + alloc : catFee + alloc;
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
            fee_affiliate: affFee,
            total_fees: lineTotalFees,
            expected_net: row.gross_amount - lineTotalFees,
            fee_override_json: feeJson(headerWithCustomer, {
              customer_id: customer.id,
              line_discount_percent: row.discount_percent,
              ...(sku ? { sku_fee: sku.snapshot } : {}),
            }),
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

/** Batalkan batch penjualan yang belum ada invoice terposting. */
export async function cancelSalesImportBatch(batchId: string): Promise<void> {
  const batch = await fetchSalesImportBatch(batchId);
  if (batch.status === "cancelled") return;
  if (batch.posted_rows > 0) {
    throw new Error(
      "Batch sudah ada invoice terposting. Batalkan manual lewat penjualan jika perlu koreksi.",
    );
  }

  const lines = await fetchSalesImportLines(batchId);
  for (const line of lines) {
    if (line.validation_status === "posted") continue;
    await updateSalesImportLine(line.id, {
      validation_status: "skipped",
      error_message: "Batch dibatalkan",
    });
  }

  await updateSalesImportBatch(batchId, { status: "cancelled" });
}

export async function createImportBatchFromFile(
  storeId: string,
  rows: ParsedImportRow[],
  userId: string,
  filename?: string,
  feeTemplateId?: string,
): Promise<SalesImportBatch> {
  const storeName = await fetchStoreNameForImport(storeId);
  validateImportTokoRows(rows, storeName);
  const account = await getOrCreateImportAccount(storeId, feeTemplateId || undefined);

  const batchNo = await nextDocNo(BIZ_DOC_NUMBER_CONFIG.imp);
  const dates = rows.map((r) => r.header.tgl_transaksi).sort();
  const batch = await createSalesImportBatch({
    batch_no: batchNo,
    store_channel_account: account.id,
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

  await processImportRows(batch.id, account.id, rows, feeTemplateId || undefined);
  return fetchSalesImportBatch(batch.id);
}
