/** Phase 12 — Rating calculation (pure). */

import { categorizeOverallScore, roundScore2, type RatingCategory } from "@/lib/hr/rating-types";

export type AspectScoreInput = {
  aspectId: string;
  aspectCode: string;
  aspectName: string;
  score: number;
};

export type ReviewerAggregateInput = {
  reviewerRowId: string;
  aspectScores: AspectScoreInput[];
};

export type AspectAggregate = {
  aspectId: string;
  aspectCode: string;
  aspectName: string;
  average: number;
};

export type RatingCalculationResult = {
  overallScore: number;
  category: RatingCategory;
  respondentCount: number;
  aspectAggregates: AspectAggregate[];
  reviewerMeans: { reviewerRowId: string; mean: number }[];
};

/**
 * Overall = mean of each submitted reviewer's aspect-mean.
 * Per-aspect = mean of that aspect across submitted reviewers.
 */
export function calculateSubjectRating(
  reviewers: ReviewerAggregateInput[],
): RatingCalculationResult {
  const submitted = reviewers.filter((r) => r.aspectScores.length > 0);
  const reviewerMeans = submitted.map((r) => {
    const sum = r.aspectScores.reduce((a, s) => a + Number(s.score), 0);
    const mean = sum / r.aspectScores.length;
    return { reviewerRowId: r.reviewerRowId, mean: roundScore2(mean) };
  });

  const overallScore =
    reviewerMeans.length === 0
      ? 0
      : roundScore2(
          reviewerMeans.reduce((a, m) => a + m.mean, 0) / reviewerMeans.length,
        );

  const byAspect = new Map<
    string,
    { aspectId: string; aspectCode: string; aspectName: string; scores: number[] }
  >();
  for (const r of submitted) {
    for (const s of r.aspectScores) {
      const cur = byAspect.get(s.aspectId) ?? {
        aspectId: s.aspectId,
        aspectCode: s.aspectCode,
        aspectName: s.aspectName,
        scores: [],
      };
      cur.scores.push(Number(s.score));
      byAspect.set(s.aspectId, cur);
    }
  }

  const aspectAggregates: AspectAggregate[] = [...byAspect.values()].map((a) => ({
    aspectId: a.aspectId,
    aspectCode: a.aspectCode,
    aspectName: a.aspectName,
    average: roundScore2(a.scores.reduce((x, y) => x + y, 0) / a.scores.length),
  }));

  return {
    overallScore,
    category: categorizeOverallScore(overallScore),
    respondentCount: submitted.length,
    aspectAggregates,
    reviewerMeans,
  };
}
