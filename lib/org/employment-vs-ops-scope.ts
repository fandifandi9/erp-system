/**
 * Phase FLEX-ORG-02 — Employment company ≠ Operational entity scope.
 *
 * EMPLOYMENT COMPANY
 * - Legal/payroll/tax identity company for the employee
 * - Stored on hr_employee_org_assignments.company (preserved)
 *
 * OPERATIONAL ENTITY SCOPE
 * - Which legal entities' operational data the user may access for a function
 * - Derived from Shared/Separated model + explicit selection ∩ management ∩ membership
 */

export type EmploymentCompanyContext = {
  /** Legal employment / primary seat company */
  employmentCompanyId: string | null;
  assignmentId: string | null;
  positionId: string | null;
};

export type OperationalEntityScopeContext = {
  functionDomain: string;
  mode: "SHARED" | "SEPARATED";
  /** Fail-closed resolved company ids for ops data */
  operationalCompanyIds: string[];
  managementGroupId: string | null;
};

/**
 * Merge employment vs ops — never replace employment with ops list.
 * Ops may be a superset of employment under Shared; employment remains distinct.
 */
export function assertEmploymentDistinctFromOps(input: {
  employmentCompanyId: string | null;
  operationalCompanyIds: string[];
}): {
  employmentCompanyId: string | null;
  operationalCompanyIds: string[];
  employmentIncludedInOps: boolean;
} {
  const emp = input.employmentCompanyId?.trim() || null;
  const ops = [...new Set(input.operationalCompanyIds.filter(Boolean))];
  return {
    employmentCompanyId: emp,
    operationalCompanyIds: ops,
    employmentIncludedInOps: emp ? ops.includes(emp) : false,
  };
}
