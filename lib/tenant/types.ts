import type { CompanyProfile, Store } from "@/lib/bisnis/types";

export type NpwpDisplayMode = "footer" | "header_secondary";
export type StoreNpwpDisplay = "inherit" | "show" | "hide";

export type DocumentIdentitySnapshot = {
  store_id: string;
  store_code: string;
  store_name: string;
  store_address?: string;
  store_phone?: string;
  store_email?: string;
  store_bank_name?: string;
  store_bank_account?: string;
  company_id?: string;
  company_legal_name: string;
  company_npwp?: string;
  show_npwp: boolean;
  npwp_display_mode: NpwpDisplayMode;
  captured_at: string;
};

export type WorkContext = {
  companyId: string;
  companyName: string;
  companyCode?: string;
  storeId: string;
  storeName: string;
  storeCode?: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode?: string;
};

export type ActivitySeverity = "info" | "success" | "warning";
export type ActivityModule = "sales" | "warehouse" | "hr" | "finance" | "purchase" | "settings";

export type ActivityEvent = {
  id: string;
  event_code: string;
  severity: ActivitySeverity;
  module: ActivityModule;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  actor?: string;
  company?: string;
  store?: string;
  warehouse?: string;
  payload_json?: string;
  occurred_at: string;
  dedupe_key?: string;
  expand?: {
    actor?: { id: string; name?: string; email?: string };
    store?: Store;
    warehouse?: { id: string; code?: string; name?: string };
  };
};

export type AuditLogEntry = {
  id: string;
  occurred_at: string;
  actor?: string;
  actor_ip?: string;
  actor_device?: string;
  module: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  summary?: string;
  changes_json?: string;
  company?: string;
  store?: string;
  warehouse?: string;
  request_id?: string;
  expand?: {
    actor?: { id: string; name?: string; email?: string };
    store?: Store;
    warehouse?: { id: string; code?: string; name?: string };
  };
};

export type EmitActivityInput = {
  event_code: string;
  severity?: ActivitySeverity;
  module: ActivityModule;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  store_id?: string;
  warehouse_id?: string;
  payload?: Record<string, unknown>;
  dedupe_key?: string;
  actor_id?: string;
};

export type WriteAuditInput = {
  module: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  summary?: string;
  changes?: { field: string; before: unknown; after: unknown }[];
  store_id?: string;
  warehouse_id?: string;
  actor_id?: string;
  actor_ip?: string;
  actor_device?: string;
};

export type ResolvedNpwpSettings = {
  show: boolean;
  mode: NpwpDisplayMode;
  company: Pick<CompanyProfile, "company_name" | "legal_name" | "npwp" | "address"> | null;
};
