/**
 * Pure progress helpers for HR Rating (1 subject → many reviewers).
 * No I/O. Used by server APIs and unit tests.
 */

export type RatingProgress = {
  requested: number;
  eligible: number | null;
  selected: number;
  completed: number;
  is_complete: boolean;
  assigned_label: string;
  completed_label: string;
  respondents_label: string;
  status_label: "Assigned" | "In Progress" | "Complete" | "Cancelled";
  aggregate_kind: "none" | "current" | "final";
};

export function insufficientReviewersMessage(available: number, requested: number): string {
  return `Reviewer tersedia hanya ${available} orang dari ${requested} yang diminta.`;
}

export function buildRatingProgress(input: {
  requested: number;
  selected: number;
  completed: number;
  eligible?: number | null;
  assignmentStatus?: string;
}): RatingProgress {
  const requested = Math.max(0, Math.floor(Number(input.requested) || 0));
  const selected = Math.max(0, Math.floor(Number(input.selected) || 0));
  const completed = Math.max(0, Math.floor(Number(input.completed) || 0));
  const eligible =
    input.eligible == null
      ? null
      : Math.max(0, Math.floor(Number(input.eligible)));
  const denom = selected || requested;
  const statusRaw = String(input.assignmentStatus || "").toLowerCase();
  const isComplete =
    statusRaw === "completed" || (selected > 0 && completed >= selected && denom > 0);
  const cancelled = statusRaw === "cancelled";

  let status_label: RatingProgress["status_label"] = "Assigned";
  if (cancelled) status_label = "Cancelled";
  else if (isComplete) status_label = "Complete";
  else if (completed > 0) status_label = "In Progress";

  return {
    requested,
    eligible,
    selected,
    completed,
    is_complete: isComplete && !cancelled,
    assigned_label: String(selected),
    completed_label: `${completed} / ${denom}`,
    respondents_label: `${completed} / ${denom}`,
    status_label,
    aggregate_kind: cancelled || completed === 0 ? "none" : isComplete ? "final" : "current",
  };
}
