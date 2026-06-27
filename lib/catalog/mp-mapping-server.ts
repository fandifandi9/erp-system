import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type MpProductMapping } from "@/lib/bisnis/types";

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function listMpMappings(
  pb: PocketBase,
  opts?: { storeId?: string; accountId?: string; q?: string },
): Promise<MpProductMapping[]> {
  const parts: string[] = [];
  if (opts?.accountId) {
    parts.push(`store_channel_account = "${esc(opts.accountId)}"`);
  } else if (opts?.storeId) {
    const accounts = await pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getFullList<{
      id: string;
    }>({
      filter: `store = "${esc(opts.storeId)}"`,
      fields: "id",
      requestKey: null,
    });
    if (accounts.length === 0) return [];
    const accFilter = accounts.map((a) => `store_channel_account = "${esc(a.id)}"`).join(" || ");
    parts.push(`(${accFilter})`);
  }
  const q = opts?.q?.trim();
  if (q) {
    const escQ = esc(q);
    parts.push(`(mp_sku ~ "${escQ}" || mp_product_name ~ "${escQ}")`);
  }
  const filter = parts.join(" && ") || undefined;
  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).getFullList<MpProductMapping>({
    filter,
    sort: "mp_sku",
    expand: "product",
    requestKey: null,
  });
}

export async function createMpMapping(
  pb: PocketBase,
  data: {
    store_channel_account: string;
    mp_sku: string;
    mp_product_name?: string;
    product: string;
    is_active?: boolean;
  },
): Promise<MpProductMapping> {
  if (!data.store_channel_account?.trim()) {
    throw new Error("Akun marketplace wajib dipilih.");
  }
  if (!data.mp_sku?.trim()) throw new Error("SKU marketplace wajib diisi.");
  if (!data.product?.trim()) throw new Error("Produk SERBA wajib dipilih.");

  const account = await pb.collection(BISNIS_COLLECTIONS.storeChannelAccounts).getOne<{
    channel?: string;
  }>(data.store_channel_account, { fields: "channel", requestKey: null });

  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).create<MpProductMapping>({
    store_channel_account: data.store_channel_account,
    channel: account.channel,
    mp_sku: data.mp_sku.trim(),
    mp_product_name: data.mp_product_name?.trim() || undefined,
    product: data.product,
    is_active: data.is_active !== false,
  });
}

export async function updateMpMapping(
  pb: PocketBase,
  id: string,
  data: Partial<{
    mp_sku: string;
    mp_product_name: string;
    product: string;
    is_active: boolean;
  }>,
): Promise<MpProductMapping> {
  const patch: Record<string, unknown> = {};
  if (data.mp_sku !== undefined) patch.mp_sku = data.mp_sku.trim();
  if (data.mp_product_name !== undefined) patch.mp_product_name = data.mp_product_name.trim() || "";
  if (data.product !== undefined) patch.product = data.product;
  if (data.is_active !== undefined) patch.is_active = data.is_active;
  return pb.collection(BISNIS_COLLECTIONS.mpProductMappings).update<MpProductMapping>(id, patch);
}

export async function deleteMpMapping(pb: PocketBase, id: string): Promise<void> {
  await pb.collection(BISNIS_COLLECTIONS.mpProductMappings).delete(id);
}
