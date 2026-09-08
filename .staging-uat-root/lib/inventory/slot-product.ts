import type { InvLocation, InvProduct } from "./types";
import { stripLayoutFromName } from "./rack-layout";
import { stripPlacementFromName } from "./location-fields";

const PRODUCT_SUFFIX = /\s*\[produk:([a-z0-9]+)\]\s*$/i;

/** Suffix di nama slot jika field assigned_product belum ada di PB. */
export function encodeProductInLocationName(name: string, productId: string): string {
  const base = stripProductFromLocationName(stripLayoutFromName(stripPlacementFromName(name)));
  const id = productId.trim();
  if (!id) return base;
  return `${base} [produk:${id}]`.trim();
}

export function stripProductFromLocationName(name: string): string {
  return name.replace(PRODUCT_SUFFIX, "").trim();
}

export function getAssignedProductId(loc: Pick<InvLocation, "name" | "assigned_product">): string {
  const field = (loc as InvLocation & { assigned_product?: string }).assigned_product?.trim();
  if (field) return field;
  const m = (loc.name ?? "").match(PRODUCT_SUFFIX);
  return m?.[1]?.trim() ?? "";
}

export function getSlotDisplayName(loc: Pick<InvLocation, "name">): string {
  return stripProductFromLocationName(stripLayoutFromName(stripPlacementFromName(loc.name ?? "")));
}

export function productLabel(p: Pick<InvProduct, "sku" | "name"> | undefined): string {
  if (!p) return "—";
  return `${p.name} (${p.sku})`;
}
