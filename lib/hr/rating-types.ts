/** Phase 12 — HR Rating types & thresholds (pure, no I/O). */

export const RATING_PERIOD_STATUSES = [
  "draft",
  "open",
  "in_progress",
  "closed",
  "cancelled",
] as const;

export type RatingPeriodStatus = (typeof RATING_PERIOD_STATUSES)[number];

export const RATING_ASSIGNMENT_METHODS = ["smart_random", "manual"] as const;
export type RatingAssignmentMethod = (typeof RATING_ASSIGNMENT_METHODS)[number];

export const RATING_REVIEWER_STATUSES = [
  "assigned",
  "draft",
  "submitted",
  "locked",
] as const;
export type RatingReviewerStatus = (typeof RATING_REVIEWER_STATUSES)[number];

export const RATING_COLLECTIONS = {
  periods: "hr_rating_periods",
  aspects: "hr_rating_aspects",
  assignments: "hr_rating_assignments",
  reviewers: "hr_rating_reviewers",
  scores: "hr_rating_scores",
  results: "hr_rating_results",
} as const;

/** Exact category thresholds (owner-approved). Avoid float boundary bugs. */
export type RatingCategory =
  | "Sangat Baik"
  | "Baik"
  | "Perlu Peningkatan"
  | "Perlu Perhatian HR";

export function categorizeOverallScore(score: number): RatingCategory {
  // Compare in cents to avoid 4.499999 / 4.50 float issues.
  const cents = Math.round(Number(score) * 100);
  if (!Number.isFinite(cents)) return "Perlu Perhatian HR";
  if (cents >= 450) return "Sangat Baik";
  if (cents >= 400) return "Baik";
  if (cents >= 300) return "Perlu Peningkatan";
  return "Perlu Perhatian HR";
}

export function roundScore2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}
