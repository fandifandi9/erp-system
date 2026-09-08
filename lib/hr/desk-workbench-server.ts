/**
 * Phase 35I-M — HR Meja Kerja task counts.
 * Real workflow counts; errors surface (no silent false-zero for query failures).
 * Leave scoped via subject membership (leave_requests has no company_id).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import {
  isHrOperationalActor,
} from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { REPORTING_COLLECTIONS } from "@/lib/hr/reporting-types";
import { countPendingRecruitmentForApprover } from "@/lib/hr/recruitment-request-server";
import { listUserIdsInCompanies } from "@/lib/hr/employment-scope";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function companyScopeFilter(companyIds: string[]): string {
  return companyIds.map((id) => `company_id = "${pbEscape(id)}"`).join(" || ");
}

function userScopeFilter(userIds: string[]): string {
  return userIds.map((id) => `user = "${pbEscape(id)}"`).join(" || ");
}

export type HrDeskWorkbenchSummary = {
  pendingLeave: number;
  suspiciousAttendance: number;
  openFindings: number;
  pendingRecruitmentApprovals: number;
  pendingOvertime?: number;
};

export async function serverGetHrDeskWorkbenchSummary(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<HrDeskWorkbenchSummary> {
  if (!isHrOperationalActor(ctx)) {
    throw new HrApiError("Akses ditolak.", 403);
  }

  const companyIds = await getHrOperationalCompanyIds(adminPb, ctx);

  if (companyIds.length === 0) {
    return {
      pendingLeave: 0,
      suspiciousAttendance: 0,
      openFindings: 0,
      pendingRecruitmentApprovals: 0,
      pendingOvertime: 0,
    };
  }

  const scope = companyScopeFilter(companyIds);
  const subjectIds = await listUserIdsInCompanies(adminPb, companyIds);

  let pendingLeave = 0;
  if (subjectIds.length > 0) {
    const leaveFilter = `status = "pending" && (${userScopeFilter(subjectIds)})`;
    try {
      const leaveRes = await adminPb.collection("leave_requests").getList(1, 1, {
        filter: leaveFilter,
        requestKey: null,
      });
      pendingLeave = leaveRes.totalItems;
    } catch (e) {
      throw new HrApiError(
        `Gagal memuat antrean cuti Meja Kerja: ${e instanceof Error ? e.message : "error"}`,
        503,
        "DESK_LEAVE_COUNT_FAILED",
      );
    }
  }

  let suspiciousAttendance = 0;
  try {
    const attRes = await adminPb.collection("attendance_logs").getList(1, 1, {
      filter: `is_suspicious = true && (${scope})`,
      requestKey: null,
    });
    suspiciousAttendance = attRes.totalItems;
  } catch (e) {
    throw new HrApiError(
      `Gagal memuat absensi mencurigakan: ${e instanceof Error ? e.message : "error"}`,
      503,
      "DESK_ATTENDANCE_COUNT_FAILED",
    );
  }

  let openFindings = 0;
  try {
    const findingRes = await adminPb.collection(REPORTING_COLLECTIONS.findings).getList(1, 1, {
      filter: `status != "closed" && (${scope})`,
      requestKey: null,
    });
    openFindings = findingRes.totalItems;
  } catch (e) {
    throw new HrApiError(
      `Gagal memuat temuan: ${e instanceof Error ? e.message : "error"}`,
      503,
      "DESK_FINDINGS_COUNT_FAILED",
    );
  }

  let pendingOvertime = 0;
  if (subjectIds.length > 0) {
    try {
      const otRes = await adminPb.collection("overtime_requests").getList(1, 1, {
        filter: `(status = "waiting_hr" || status = "pending") && (${userScopeFilter(subjectIds)})`,
        requestKey: null,
      });
      pendingOvertime = otRes.totalItems;
    } catch (err) {
      throw new HrApiError(
        err instanceof Error ? err.message : "Gagal memuat antrian lembur.",
        503,
        "DESK_OT_COUNT_FAILED",
      );
    }
  }

  const pendingRecruitmentApprovals = await countPendingRecruitmentForApprover(adminPb, ctx);

  return {
    pendingLeave,
    suspiciousAttendance,
    openFindings,
    pendingRecruitmentApprovals,
    pendingOvertime,
  };
}
