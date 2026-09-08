import { pb } from "@/lib/pocketbase";
import { fetchMpFeeTemplate } from "./mp-template-client";
import {
  BISNIS_COLLECTIONS,
  type Customer,
  type SalesChannel,
  type MpSellerTier,
  type Store,
  type StoreChannelAccount,
} from "./types";
import { slugFromName, storePlatformLabel } from "./mp-slug";
import { relationId } from "./relation-id";
import type { ParsedImportRow } from "./mp-import-parse";

const DIRECT_CHANNEL_CODE = "langsung";
const DIRECT_TIER_CODE = "umum";
const DEFAULT_TIER_CODE = "umum";
const DEFAULT_TIER_LABEL = "Umum";

async function listChannels(): Promise<SalesChannel[]> {
  return pb.collection(BISNIS_COLLECTIONS.salesChannels).getFullList<SalesChannel>({
    sort: "name",
    requestKey: null,
  });
}

async function listTiers(channelId: string): Promise<MpSellerTier[]> {
  return pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).getFullList<MpSellerTier>({
    filter: `channel = "${channelId}"`,
    sort: "sort_order,label",
    requestKey: null,
  });
}

async function listAccounts(): Promise<StoreChannelAccount[]> {
  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getFullList<StoreChannelAccount>({
    sort: "account_name",
    requestKey: null,
  });
}

/** Channel + tier untuk penjualan WA / web / personal (tanpa potongan MP). */
export async function ensureDirectSalesChannel(): Promise<{ channelId: string; tierId: string }> {
  const channels = await listChannels();
  let ch = channels.find((c) => c.code === DIRECT_CHANNEL_CODE);
  if (!ch) {
    ch = await pb.collection(BISNIS_COLLECTIONS.salesChannels).create<SalesChannel>({
      code: DIRECT_CHANNEL_CODE,
      name: "Penjualan Langsung",
      is_active: true,
      notes: "WA, web personal — tanpa potongan marketplace",
    });
  }
  const tiers = await listTiers(ch.id);
  let tier = tiers.find((t) => t.code === DIRECT_TIER_CODE);
  if (!tier) {
    tier = await pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).create<MpSellerTier>({
      channel: ch.id,
      code: DIRECT_TIER_CODE,
      label: "Umum",
      sort_order: 1,
      is_active: true,
    });
  }
  return { channelId: ch.id, tierId: tier.id };
}

/** Tier default untuk platform tanpa tier (mis. Website — tanpa rumus biaya). */
export async function ensureDefaultTierForChannel(channelId: string): Promise<string> {
  const tiers = await listTiers(channelId);
  const active = tiers.find((t) => t.is_active !== false);
  if (active) return active.id;

  let tier = tiers.find((t) => t.code === DEFAULT_TIER_CODE);
  if (!tier) {
    tier = await pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).create<MpSellerTier>({
      channel: channelId,
      code: DEFAULT_TIER_CODE,
      label: DEFAULT_TIER_LABEL,
      sort_order: 1,
      is_active: true,
    });
  }
  return tier.id;
}

/** Akun toko+platform untuk POS / import — buat otomatis bila belum ada. */
export async function getOrCreateStoreChannelAccount(opts: {
  storeId: string;
  channelId: string;
  sellerTierId: string;
  feeTemplateId?: string;
}): Promise<StoreChannelAccount> {
  if (opts.feeTemplateId) {
    const tpl = await fetchMpFeeTemplate(opts.feeTemplateId);
    if (
      relationId(tpl.channel) !== opts.channelId ||
      relationId(tpl.seller_tier) !== opts.sellerTierId
    ) {
      throw new Error("Rumus biaya tidak cocok dengan platform/tier yang dipilih.");
    }
    return getOrCreateImportAccount(opts.storeId, opts.feeTemplateId);
  }

  const store = await fetchStoreById(opts.storeId);
  const accounts = await listAccounts();
  const hit = accounts.find(
    (a) =>
      a.store === opts.storeId &&
      a.channel === opts.channelId &&
      a.seller_tier === opts.sellerTierId &&
      !a.default_fee_template,
  );
  if (hit) return hit;

  const [channel, tier] = await Promise.all([
    pb.collection(BISNIS_COLLECTIONS.salesChannels).getOne<SalesChannel>(opts.channelId, {
      requestKey: null,
    }),
    pb.collection(BISNIS_COLLECTIONS.mpSellerTiers).getOne<MpSellerTier>(opts.sellerTierId, {
      requestKey: null,
    }),
  ]);

  const customers = await pb
    .collection(BISNIS_COLLECTIONS.customers)
    .getFullList<Customer>({ sort: "name", requestKey: null })
    .catch(() => [] as Customer[]);
  const defaultCustomer = customers[0]?.id;
  if (!defaultCustomer) {
    throw new Error("Buat minimal 1 kontak di menu Pelanggan untuk sesi marketplace.");
  }

  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).create<StoreChannelAccount>({
    store: opts.storeId,
    channel: opts.channelId,
    seller_tier: opts.sellerTierId,
    default_customer: defaultCustomer,
    account_name: storePlatformLabel(store.name, channel.name, tier.label),
    is_active: true,
    notes: "Auto dari POS (tanpa rumus biaya / web)",
  });
}

async function fetchStoreById(storeId: string): Promise<Store> {
  return pb.collection(BISNIS_COLLECTIONS.stores).getOne<Store>(storeId, { requestKey: null });
}

/**
 * Akun teknis untuk batch import — otomatis dari toko + koleksi biaya tier.
 */
export async function getOrCreateImportAccount(
  storeId: string,
  feeTemplateId?: string,
): Promise<StoreChannelAccount> {
  const store = await fetchStoreById(storeId);
  const accounts = await listAccounts();

  let channelId: string;
  let sellerTierId: string;
  let defaultFeeTemplate: string | undefined;
  let accountLabel: string;

  if (feeTemplateId) {
    const tpl = await fetchMpFeeTemplate(feeTemplateId);
    if (!tpl.channel || !tpl.seller_tier) {
      throw new Error("Koleksi biaya harus punya platform dan tier.");
    }
    channelId = tpl.channel;
    sellerTierId = tpl.seller_tier;
    defaultFeeTemplate = feeTemplateId;
    const platform = tpl.expand?.channel?.name ?? "MP";
    const tier = tpl.expand?.seller_tier?.label ?? "";
    accountLabel = storePlatformLabel(store.name, platform, tier);

    const hit = accounts.find(
      (a) =>
        a.store === storeId &&
        a.channel === channelId &&
        a.seller_tier === sellerTierId &&
        a.default_fee_template === feeTemplateId,
    );
    if (hit) return hit;
  } else {
    const direct = await ensureDirectSalesChannel();
    channelId = direct.channelId;
    sellerTierId = direct.tierId;
    defaultFeeTemplate = undefined;
    accountLabel = `${store.name} · Langsung`;

    const hit = accounts.find(
      (a) =>
        a.store === storeId &&
        a.channel === channelId &&
        a.seller_tier === sellerTierId &&
        !a.default_fee_template,
    );
    if (hit) return hit;
  }

  const customers = await pb
    .collection(BISNIS_COLLECTIONS.customers)
    .getFullList<Customer>({ sort: "name", requestKey: null })
    .catch(() => [] as Customer[]);
  const defaultCustomer = customers[0]?.id;
  if (!defaultCustomer) {
    throw new Error("Buat minimal 1 kontak di menu Kontak untuk posting invoice.");
  }

  return pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).create<StoreChannelAccount>({
    store: storeId,
    channel: channelId,
    seller_tier: sellerTierId,
    default_fee_template: defaultFeeTemplate,
    default_customer: defaultCustomer,
    account_name: accountLabel,
    is_active: true,
    notes: feeTemplateId ? "Auto dari import (tier MP)" : "Auto dari import (tanpa potongan MP)",
  });
}

export async function fetchStoreNameForImport(storeId: string): Promise<string> {
  const store = await fetchStoreById(storeId);
  return store.name;
}

function normToko(s: string): string {
  return s.trim().toLowerCase();
}

/** Semua baris wajib isi kolom toko (*) dan harus sama dengan toko yang dipilih. */
export function validateImportTokoRows(rows: ParsedImportRow[], expectedStoreName: string): void {
  const expected = normToko(expectedStoreName);
  if (!expected) throw new Error("Nama toko tidak valid.");

  const missing: number[] = [];
  const mismatch: { row: number; got: string }[] = [];

  for (const r of rows) {
    const t = r.header.toko?.trim() ?? "";
    if (!t) {
      missing.push(r.rowNo);
      continue;
    }
    if (normToko(t) !== expected) {
      mismatch.push({ row: r.rowNo, got: t });
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Kolom toko (*) wajib diisi. Baris kosong: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`,
    );
  }
  if (mismatch.length > 0) {
    const sample = mismatch
      .slice(0, 3)
      .map((m) => `baris ${m.row}="${m.got}"`)
      .join("; ");
    throw new Error(
      `Kolom toko harus "${expectedStoreName}" (sama dengan pilihan saat upload). Tidak cocok: ${sample}`,
    );
  }
}
