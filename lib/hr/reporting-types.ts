export const REPORTING_COLLECTIONS = {
  reports: "hr_staff_reports",
  findings: "hr_findings",
  attachments: "hr_case_attachments",
} as const;

export const REPORTING_MAX_ATTACHMENTS = 5;
export const REPORTING_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const REPORTING_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReportingAllowedMime = (typeof REPORTING_ALLOWED_MIME)[number];

export const REPORT_CATEGORIES = ["facility", "safety", "other"] as const;
export const FINDING_CATEGORIES = ["safety", "misconduct", "operations", "other"] as const;
export const CASE_STATUSES = ["draft", "submitted", "in_review", "closed"] as const;
export const CASE_PRIORITIES = ["low", "medium", "high"] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export type CaseKind = "report" | "finding";

export type ReportingCase = {
  id: string;
  kind: CaseKind;
  title: string;
  body: string;
  category: string;
  status: CaseStatus;
  priority: CasePriority;
  location_text: string;
  created_by: string;
  company_id: string;
  hr_note: string;
  submitted_at: string;
  closed_at: string;
  closed_by: string;
  created: string;
  updated: string;
};

export type ReportingAttachmentMeta = {
  id: string;
  kind: CaseKind;
  parent_id: string;
  original_name: string;
  mime: string;
  size: number;
  created: string;
  created_by: string;
  /** Auth-gated Next.js URL — never a public PocketBase file URL. */
  url: string;
};
