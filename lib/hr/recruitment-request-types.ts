/**
 * Phase 35I-J — Recruitment appointment requests (approval queue).
 * Recruitment ≠ organization appointment.
 */

export const HR_RECRUITMENT_REQUESTS_COLLECTION = "hr_recruitment_requests";

export const RECRUITMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

export type RecruitmentRequestRecord = {
  id: string;
  candidateUserId: string;
  candidateName: string;
  candidateEmail: string;
  companyId: string;
  orgPositionId: string;
  orgPositionName: string;
  profileId: string | null;
  requestedBy: string;
  status: RecruitmentStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decision: string;
  rejectionReason: string;
  notes: string;
  created: string;
  updated: string;
};

export function parseRecruitmentStatus(raw: unknown): RecruitmentStatus {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "APPROVED" || s === "REJECTED" || s === "PENDING") return s;
  return "PENDING";
}
