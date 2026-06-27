import { relationId } from "@/lib/bisnis/relation-id";
import type {
  MpFeeTemplate,
  MpSellerTier,
  SalesChannel,
} from "@/lib/bisnis/types";
import {
  ensureDefaultTierForChannel,
  getOrCreateStoreChannelAccount,
} from "@/lib/bisnis/mp-import-resolve";

export type PosMarketplaceOption = {
  /** Nilai dropdown — `ct:<channelId>:<tierId>` atau `ch:<channelId>` */
  id: string;
  label: string;
  channelId: string;
  sellerTierId?: string;
  feeTemplateId?: string;
};

function optionLabel(channelName: string, tierName?: string) {
  const ch = channelName.trim();
  const tier = tierName?.trim() ?? "";
  if (!tier || tier.toLowerCase() === ch.toLowerCase()) return ch;
  return `${ch} · ${tier}`;
}

/**
 * Satu opsi per platform + tier (tanpa duplikat rumus/akun).
 * Platform tanpa tier (mis. Website) tetap muncul — tier dibuat otomatis saat mulai sesi.
 */
export function buildPosMarketplaceOptions(input: {
  channels: SalesChannel[];
  tiers: MpSellerTier[];
  templates: MpFeeTemplate[];
}): PosMarketplaceOption[] {
  const { channels, tiers, templates } = input;
  const activeChannels = channels.filter((c) => c.is_active !== false);
  const activeTemplates = templates.filter((t) => t.is_active !== false);
  const byPair = new Map<string, PosMarketplaceOption>();

  const upsert = (
    channelId: string,
    sellerTierId: string,
    chName: string,
    tierName: string,
    feeTemplateId?: string,
  ) => {
    const key = `${channelId}:${sellerTierId}`;
    const existing = byPair.get(key);
    const label = optionLabel(chName, tierName);
    if (!existing) {
      byPair.set(key, {
        id: `ct:${channelId}:${sellerTierId}`,
        label,
        channelId,
        sellerTierId,
        feeTemplateId,
      });
      return;
    }
    if (!existing.feeTemplateId && feeTemplateId) {
      byPair.set(key, { ...existing, feeTemplateId });
    }
  };

  for (const tier of tiers.filter((t) => t.is_active !== false)) {
    const channelId = relationId(tier.channel);
    const ch = activeChannels.find((c) => c.id === channelId);
    if (!ch) continue;
    const tpl = activeTemplates.find(
      (t) => relationId(t.channel) === channelId && relationId(t.seller_tier) === tier.id,
    );
    upsert(channelId, tier.id, ch.name, tier.label, tpl?.id);
  }

  for (const ch of activeChannels) {
    const hasTier = tiers.some(
      (t) => t.is_active !== false && relationId(t.channel) === ch.id,
    );
    if (hasTier) continue;
    byPair.set(`ch:${ch.id}`, {
      id: `ch:${ch.id}`,
      label: ch.name,
      channelId: ch.id,
    });
  }

  return [...byPair.values()].sort((a, b) => a.label.localeCompare(b.label, "id"));
}

export async function resolvePosMarketplaceAccount(
  storeId: string,
  optionId: string,
  options: PosMarketplaceOption[],
): Promise<import("@/lib/bisnis/types").StoreChannelAccount> {
  const opt = options.find((o) => o.id === optionId);
  if (!opt) {
    throw new Error("Pilihan marketplace tidak valid");
  }
  const sellerTierId = opt.sellerTierId ?? (await ensureDefaultTierForChannel(opt.channelId));
  return getOrCreateStoreChannelAccount({
    storeId,
    channelId: opt.channelId,
    sellerTierId,
    feeTemplateId: opt.feeTemplateId,
  });
}
