/** Phase 12 — Deterministic summary / suggestions from aspect aggregates. */

import type { AspectAggregate } from "@/lib/hr/rating-calc";
import type { RatingCategory } from "@/lib/hr/rating-types";

export type RatingNarrative = {
  summary: string;
  strengths: string;
  improvements: string;
  suggestions: string;
};

function topAspects(aspects: AspectAggregate[], n: number, ascending: boolean) {
  const sorted = [...aspects].sort((a, b) =>
    ascending ? a.average - b.average : b.average - a.average,
  );
  return sorted.slice(0, Math.min(n, sorted.length));
}

export function buildRatingNarrative(
  overall: number,
  category: RatingCategory,
  aspects: AspectAggregate[],
): RatingNarrative {
  const strengths = topAspects(aspects, 2, false);
  const improvements = topAspects(aspects, 2, true).filter((a) => a.average < 4.5);

  const summaryByCat: Record<RatingCategory, string> = {
    "Sangat Baik":
      "Secara umum kinerja menunjukkan hasil yang sangat baik dan konsisten di berbagai aspek.",
    Baik: "Secara umum kinerja menunjukkan hasil yang baik.",
    "Perlu Peningkatan":
      "Kinerja menunjukkan dasar yang cukup, namun beberapa aspek masih perlu ditingkatkan.",
    "Perlu Perhatian HR":
      "Hasil evaluasi memerlukan perhatian HR untuk rencana perbaikan yang terstruktur.",
  };

  const strengthText =
    strengths.length > 0
      ? `${strengths.map((s) => s.aspectName).join(" dan ")} menunjukkan hasil kuat.`
      : "Belum ada aspek yang menonjol secara signifikan.";

  const improvementText =
    improvements.length > 0
      ? `${improvements.map((s) => s.aspectName).join(" dan ")} perlu ditingkatkan.`
      : "Tidak ada aspek kritis yang menonjol untuk perbaikan segera.";

  const suggestionParts: string[] = [];
  if (strengths.length) {
    suggestionParts.push(
      `Pertahankan ${strengths.map((s) => s.aspectName.toLowerCase()).join(" dan ")}`,
    );
  }
  if (improvements.length) {
    suggestionParts.push(
      `tingkatkan ${improvements.map((s) => s.aspectName.toLowerCase()).join(" dan ")} melalui koordinasi dan praktik kerja yang lebih terarah`,
    );
  }
  if (!suggestionParts.length) {
    suggestionParts.push("Lanjutkan praktik kerja yang sudah berjalan dengan baik");
  }

  return {
    summary: summaryByCat[category],
    strengths: strengthText,
    improvements: improvementText,
    suggestions: `${suggestionParts.join(" serta ")}. (Skor akhir: ${overall.toFixed(2)})`,
  };
}
