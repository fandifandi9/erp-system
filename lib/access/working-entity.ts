/**
 * Phase 35I-C — Resolve working company within an authorized entity set.
 * Active entity is a FILTER CONTEXT only — never grants authorization.
 */

/**
 * Pick the working company for queries:
 * - if active ∈ authorized → [active]
 * - else fallback → [authorized[0]] (deterministic first, Work Context style)
 * - if authorized empty → []
 */
export function resolveWorkingCompanyIds(
  authorizedCompanyIds: readonly string[],
  activeCompanyId: string | null | undefined,
): string[] {
  const authorized = [...new Set(authorizedCompanyIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (authorized.length === 0) return [];

  const active = String(activeCompanyId ?? "").trim();
  if (active && authorized.includes(active)) {
    return [active];
  }
  return [authorized[0]!];
}

/** Read active company from users record (server SSOT). */
export function readActiveCompanyIdFromUser(
  user: Record<string, unknown> | null | undefined,
): string | null {
  if (!user) return null;
  const active = String(user.active_company ?? "").trim();
  if (active) return active;
  const fallback = String(user.default_company ?? "").trim();
  return fallback || null;
}
