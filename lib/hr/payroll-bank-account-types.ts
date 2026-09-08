export const PAYROLL_BANK_COLLECTION = "hr_payroll_bank_accounts" as const;

export const PAYROLL_BANK_STATUSES = ["active", "pending", "inactive", "rejected"] as const;
export type PayrollBankStatus = (typeof PAYROLL_BANK_STATUSES)[number];

export type PayrollBankAccountRecord = {
  id: string;
  user: string;
  bank_name: string;
  account_number: string;
  account_holder_name: string;
  status: PayrollBankStatus;
  note?: string;
  evidence_document_id?: string;
  /** @deprecated use effective_from */
  effective_at?: string;
  effective_from?: string;
  effective_until?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created: string;
  updated: string;
};

export type SelfPayrollBankView = {
  active: {
    id: string;
    bank_name: string;
    account_number_masked: string;
    account_holder_name: string;
    status: "active";
    effective_from?: string;
    effective_until?: string;
  } | null;
  pending: {
    id: string;
    bank_name: string;
    account_number_masked: string;
    account_holder_name: string;
    status: "pending";
    note?: string;
    created: string;
  } | null;
  last_rejected: {
    bank_name: string;
    account_number_masked: string;
    account_holder_name: string;
    rejection_reason: string;
    rejected_at: string;
  } | null;
};

export type HrPayrollBankRequestView = {
  id: string;
  user_id: string;
  employee_name: string;
  employee_code?: string;
  current: {
    bank_name: string;
    account_number_masked: string;
    account_holder_name: string;
    effective_from?: string;
    effective_until?: string;
  } | null;
  proposed: {
    bank_name: string;
    account_number_masked: string;
    account_holder_name: string;
    note?: string;
  };
  status: "pending";
  created: string;
};
