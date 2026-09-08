/**
 * Phase 35I-D/F3 — Organizational Position Master types.
 * Hierarchy is Parent Position → Child Position (not title-level based).
 * Phase FLEX-ORG-01 — optional workspaceDomain (functional ERP domain, not jabatan).
 */

import type { PositionScopeType } from "@/lib/hr/org-assignment-types";
import type { WorkspaceDomain } from "@/lib/org/workspace-domain";

export const HR_ORG_POSITIONS_COLLECTION = "hr_org_positions";

export type OrgPositionRecord = {
  id: string;
  companyId: string;
  name: string;
  code?: string;
  department?: string;
  division?: string;
  parentPositionId: string | null;
  /** Compatibility mirror — first active holder (assignment SSOT may have many). */
  holderUserId: string | null;
  holderName?: string | null;
  /** Phase 35I-I — all active holders on this position */
  holderUserIds?: string[];
  holderNames?: string[];
  holderCount?: number;
  isActive: boolean;
  isRoot: boolean;
  sortOrder: number;
  notes?: string;
  /** Phase 35I-F3 — GROUP position company scope */
  scopeType: PositionScopeType;
  scopeCompanyIds: string[];
  /** true when holderCount ≥ 1 (not a single-seat lock) */
  filled: boolean;
  childCount?: number;
  /**
   * Phase FLEX-ORG-01 — Functional workspace domain (hr/finance/warehouse/…).
   * NEVER inferred from position name. Null = unset (legacy fallback).
   */
  workspaceDomain?: WorkspaceDomain | null;
  /** Optional free-form org level label (Director/Manager/…) — NOT a permission. */
  orgLevelLabel?: string | null;
};

export type OrgPositionTreeNode = OrgPositionRecord & {
  children: OrgPositionTreeNode[];
};

export type DerivedSuperior = {
  parentPositionId: string | null;
  parentPositionName: string | null;
  superiorUserId: string | null;
  superiorName: string | null;
  vacant: boolean;
};

export type DerivedApprover = {
  targetPositionId: string;
  targetPositionName: string;
  parentPositionId: string | null;
  parentPositionName: string | null;
  approverUserId: string | null;
  approverName: string | null;
  vacant: boolean;
  reason: string;
};
