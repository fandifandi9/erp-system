/**
 * Phase 12 — Smart Random reviewer selection (pure selection + server helpers).
 *
 * Relevance (D1-A): company scope required + at least one of:
 *   same department | same division | same office
 * Do NOT treat every same-company employee as automatically relevant.
 *
 * Soft anti-bias (D7): prefer not reusing previous-period reviewers when alternatives exist.
 */

export type CandidateProfile = {
  userId: string;
  status: string;
  department: string;
  division: string;
  officeId: string;
  companyIds: string[];
};

export type SubjectContext = {
  userId: string;
  department: string;
  division: string;
  officeId: string;
  companyIds: string[];
};

export type RelevanceTier = "department" | "division" | "office";

export type RankedCandidate = {
  userId: string;
  tier: RelevanceTier;
  /** Lower = stronger relevance */
  tierRank: number;
};

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isActiveStatus(status: string): boolean {
  const st = String(status || "active").trim().toLowerCase();
  return !st || st === "active";
}

export function sharesCompany(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/**
 * Build relevant pool. Must share company AND match dept OR division OR office.
 */
export function buildRelevantPool(
  subject: SubjectContext,
  candidates: CandidateProfile[],
  opts: {
    excludeUserIds: Set<string>;
  },
): RankedCandidate[] {
  const subDept = norm(subject.department);
  const subDiv = norm(subject.division);
  const subOffice = String(subject.officeId || "").trim();

  const out: RankedCandidate[] = [];

  for (const c of candidates) {
    if (opts.excludeUserIds.has(c.userId)) continue;
    if (c.userId === subject.userId) continue;
    if (!isActiveStatus(c.status)) continue;
    if (!sharesCompany(subject.companyIds, c.companyIds)) continue;

    const cDept = norm(c.department);
    const cDiv = norm(c.division);
    const cOffice = String(c.officeId || "").trim();

    let tier: RelevanceTier | null = null;
    let tierRank = 99;
    if (subDept && cDept && subDept === cDept) {
      tier = "department";
      tierRank = 1;
    } else if (subDiv && cDiv && subDiv === cDiv) {
      tier = "division";
      tierRank = 2;
    } else if (subOffice && cOffice && subOffice === cOffice) {
      tier = "office";
      tierRank = 3;
    }

    if (!tier) continue; // same company alone is NOT enough
    out.push({ userId: c.userId, tier, tierRank });
  }

  return out;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export type SmartRandomResult =
  | {
      ok: true;
      selected: RankedCandidate[];
      eligible: RankedCandidate[];
      previousAvoided: string[];
    }
  | {
      ok: false;
      reason: "insufficient_eligible";
      requested: number;
      available: number;
      eligible: RankedCandidate[];
      message: string;
    };

/**
 * Select `count` reviewers: prefer strongest tiers, random within tier,
 * soft-avoid previousPeriodReviewerIds when alternatives remain.
 */
export function selectSmartRandomReviewers(
  pool: RankedCandidate[],
  count: number,
  opts?: {
    previousPeriodReviewerIds?: string[];
    rng?: () => number;
  },
): SmartRandomResult {
  const rng = opts?.rng ?? Math.random;
  const previous = new Set(opts?.previousPeriodReviewerIds ?? []);
  const eligible = [...pool].sort((a, b) => a.tierRank - b.tierRank);

  if (count < 1) {
    return {
      ok: false,
      reason: "insufficient_eligible",
      requested: count,
      available: eligible.length,
      eligible,
      message: "Jumlah reviewer harus minimal 1.",
    };
  }

  if (eligible.length < count) {
    return {
      ok: false,
      reason: "insufficient_eligible",
      requested: count,
      available: eligible.length,
      eligible,
      message: `Only ${eligible.length} eligible reviewers were found. ${count} reviewers were requested.`,
    };
  }

  // Work tier-by-tier: fill from strongest tiers first, random within each tier.
  const byTier = new Map<number, RankedCandidate[]>();
  for (const c of eligible) {
    const list = byTier.get(c.tierRank) ?? [];
    list.push(c);
    byTier.set(c.tierRank, list);
  }
  const ranks = [...byTier.keys()].sort((a, b) => a - b);

  const selected: RankedCandidate[] = [];
  const selectedIds = new Set<string>();
  const previousAvoided: string[] = [];

  const tryPick = (preferAvoidPrevious: boolean) => {
    for (const rank of ranks) {
      if (selected.length >= count) break;
      const bucket = [...(byTier.get(rank) ?? [])].filter((c) => !selectedIds.has(c.userId));
      shuffleInPlace(bucket, rng);
      const ordered = preferAvoidPrevious
        ? [
            ...bucket.filter((c) => !previous.has(c.userId)),
            ...bucket.filter((c) => previous.has(c.userId)),
          ]
        : bucket;
      for (const c of ordered) {
        if (selected.length >= count) break;
        if (preferAvoidPrevious && previous.has(c.userId) && bucket.some((x) => !previous.has(x.userId) && !selectedIds.has(x.userId))) {
          previousAvoided.push(c.userId);
          continue;
        }
        selected.push(c);
        selectedIds.add(c.userId);
      }
    }
  };

  tryPick(true);
  if (selected.length < count) {
    // Soft anti-bias: allow previous if still short
    tryPick(false);
  }

  if (selected.length < count) {
    return {
      ok: false,
      reason: "insufficient_eligible",
      requested: count,
      available: eligible.length,
      eligible,
      message: `Only ${selected.length} eligible reviewers could be selected. ${count} reviewers were requested.`,
    };
  }

  return {
    ok: true,
    selected: selected.slice(0, count),
    eligible,
    previousAvoided: [...new Set(previousAvoided)],
  };
}
