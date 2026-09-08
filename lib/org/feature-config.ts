/**
 * Phase FLEX-ORG-01 — Feature / module availability foundation (tenant-level).
 *
 * Feature enabled ≠ user permission.
 * Availability gates progressive disclosure; capability still gates actions.
 */

export const FEATURE_PACK_IDS = [
  "hr",
  "finance",
  "warehouse",
  "purchasing",
  "sales",
  "pos",
  "multi_company",
  "advanced_organization",
] as const;

export type FeaturePackId = (typeof FEATURE_PACK_IDS)[number];

export type FeaturePackState = {
  packId: FeaturePackId;
  enabled: boolean;
};

/** Default micro company: core packs off until explicitly enabled (except none by default). */
export const DEFAULT_MICRO_FEATURE_PACKS: Record<FeaturePackId, boolean> = {
  hr: false,
  finance: false,
  warehouse: false,
  purchasing: false,
  sales: false,
  pos: false,
  multi_company: false,
  advanced_organization: false,
};

export function isFeaturePackId(value: unknown): value is FeaturePackId {
  return typeof value === "string" && (FEATURE_PACK_IDS as readonly string[]).includes(value);
}

/**
 * Resolve enabled packs for a tenant.
 * `overrides` from DB/config; missing keys use defaults (micro = off).
 * Owner/admin UI may force-enable for setup — not a permission grant.
 */
export function resolveFeaturePacks(
  overrides?: Partial<Record<FeaturePackId, boolean>> | null,
): Record<FeaturePackId, boolean> {
  const out = { ...DEFAULT_MICRO_FEATURE_PACKS };
  if (!overrides) return out;
  for (const id of FEATURE_PACK_IDS) {
    if (typeof overrides[id] === "boolean") out[id] = overrides[id]!;
  }
  return out;
}

/** Progressive disclosure: hide enterprise UI unless pack enabled. */
export function shouldShowEnterpriseOrgUi(packs: Record<FeaturePackId, boolean>): boolean {
  return packs.multi_company === true || packs.advanced_organization === true;
}
