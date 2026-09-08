export {
  EMPLOYEE_CAPABILITIES,
  EMPLOYEE_CAPABILITY_DEFS,
  SENSITIVE_PROFILE_FIELDS,
  getEmployeeCapabilityScope,
  hasEmployeeCapability,
  isPrivilegedTargetUser,
  resolveEmployeeCapabilities,
  type EmployeeCapability,
  type EmployeeCapabilityMeta,
  type EmployeeDataScope,
  type SensitiveProfileField,
} from "./employee";

export {
  ATTENDANCE_CAPABILITIES,
  ATTENDANCE_CAPABILITY_DEFS,
  getAttendanceCapabilityScope,
  hasAttendanceCapability,
  hasLegacyAttendanceView,
  resolveAttendanceCapabilities,
  type AttendanceCapability,
  type AttendanceDataScope,
} from "./attendance";

export {
  MASTER_DATA_CAPABILITIES,
  hasMasterDataCapability,
  resolveMasterDataCapabilities,
  type MasterDataCapability,
} from "./master-data";

export {
  SCHEDULE_CAPABILITIES,
  SCHEDULE_CAPABILITY_DEFS,
  hasScheduleCapability,
  resolveScheduleCapabilities,
  type ScheduleCapability,
} from "./schedule";

export {
  PAYSLIP_CAPABILITIES,
  hasPayslipCapability,
  resolvePayslipCapabilities,
  type PayslipCapability,
} from "./payroll";

export {
  EMPLOYEE_DOCUMENT_CAPABILITIES,
  hasEmployeeDocumentCapability,
  resolveEmployeeDocumentCapabilities,
  type EmployeeDocumentCapability,
} from "./employee-document";

export {
  HR_POLICY_CAPABILITIES,
  hasHrPolicyCapability,
  resolveHrPolicyCapabilities,
  type HrPolicyCapability,
} from "./hr-policy";

export {
  canAccessHrWebModule,
  canAccessEmployeeManagement,
  canAccessEmployeeCreate,
  canAccessWebPathWithCapability,
  filterEmployeeNavItems,
  EMPLOYEE_CAPABILITY_MATRIX,
} from "./web-access";
